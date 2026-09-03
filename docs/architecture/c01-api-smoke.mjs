// 仅对本次隔离基线服务运行原项目冒烟流程；不是新业务或最终验收框架。
import fs from 'node:fs';
const base = 'http://127.0.0.1:33300/api/v1';
const evidence = [];
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /token|password|secret/i.test(k) ? '[已隐藏]' : redact(v),
      ]),
    );
  return value;
}
async function call(name, method, path, body, token, expected) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 200);
  }
  evidence.push({ name, method, path, status: response.status, expected, body: redact(data) });
  if (expected && !expected.includes(response.status))
    throw new Error(`${name}: HTTP ${response.status}`);
  return data;
}
try {
  await call('存活', 'GET', '/health', null, null, [200]);
  await call('真实数据库探针', 'GET', '/health/db', null, null, [200]);
  await call('无凭据拒绝', 'GET', '/orders', null, null, [401]);
  const chef = await call(
    '虚构厨师密码登录',
    'POST',
    '/auth/password-login',
    { phone: '19900000001', password: 'c01-audit-only-password', gender: 'male' },
    null,
    [200],
  );
  const wife = await call(
    '虚构点菜者密码登录',
    'POST',
    '/auth/password-login',
    { phone: '19900000002', password: 'c01-audit-only-password', gender: 'female' },
    null,
    [200],
  );
  const outsider = await call(
    '虚构隔离对照账号',
    'POST',
    '/auth/password-login',
    { phone: '19900000003', password: 'c01-audit-only-password' },
    null,
    [200],
  );
  const admin = await call(
    '原版管理员登录',
    'POST',
    '/auth/admin/login',
    { username: 'admin', password: 'admin123456' },
    null,
    [200],
  );
  await call('管理员接口可达', 'GET', '/admin/users', null, admin.token, [200]);
  await call('普通用户不可访问管理端', 'GET', '/admin/users', null, wife.token, [403]);
  await call('创建审查家庭', 'POST', '/families', { name: 'C01隔离冒烟家庭' }, chef.token, [201]);
  const invite = await call(
    '取得测试邀请码',
    'POST',
    '/families/me/invite-code',
    {},
    chef.token,
    [200],
  );
  await call(
    '第二人加入',
    'POST',
    '/families/join',
    { inviteCode: invite.inviteCode },
    wife.token,
    [200],
  );
  await call(
    '创建隔离对照家庭',
    'POST',
    '/families',
    { name: 'C01其他家庭' },
    outsider.token,
    [201],
  );
  const form = new FormData();
  form.append(
    'file',
    new Blob(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
          'base64',
        ),
      ],
      { type: 'image/png' },
    ),
    'audit.png',
  );
  const upload = await call('原版上传链路', 'POST', '/storage/upload', form, chef.token, [201]);
  const photo = await fetch(upload.url, { signal: AbortSignal.timeout(10000) });
  evidence.push({
    name: '匿名读取刚上传的隔离图片',
    url: upload.url,
    status: photo.status,
    bytes: (await photo.arrayBuffer()).byteLength,
  });
  const r1 = await call(
    '创建菜谱一',
    'POST',
    '/recipes',
    { name: 'C01测试菜一', imageUrls: [upload.url], difficulty: 1 },
    chef.token,
    [201],
  );
  const r2 = await call(
    '原版点菜者也能创建菜谱',
    'POST',
    '/recipes',
    { name: 'C01测试菜二', difficulty: 2 },
    wife.token,
    [201],
  );
  await call('家庭菜谱列表', 'GET', '/recipes', null, wife.token, [200]);
  const order = await call(
    '两菜统一下单',
    'POST',
    '/orders',
    {
      chefUserId: chef.user.id,
      items: [{ recipeId: r1.id, customNotes: '少盐' }, { recipeId: r2.id }],
      customerNotes: '纯测试',
      expectedServeAt: new Date(Date.now() + 3600000).toISOString(),
    },
    wife.token,
    [201],
  );
  await call('跨家庭餐单隔离', 'GET', `/orders/${order.id}`, null, outsider.token, [403]);
  await call('食客不能自行接单', 'POST', `/orders/${order.id}/accept`, {}, wife.token, [403]);
  await call('原版厨师接单', 'POST', `/orders/${order.id}/accept`, {}, chef.token, [200]);
  await call('原版必须备菜', 'POST', `/orders/${order.id}/prepping`, {}, chef.token, [200]);
  await call('原版做饭中', 'POST', `/orders/${order.id}/cooking`, {}, chef.token, [200]);
  await call(
    '原版上菜',
    'POST',
    `/orders/${order.id}/serve`,
    { imageUrls: [upload.url] },
    chef.token,
    [200],
  );
  await call(
    '原版评价结算',
    'POST',
    `/orders/${order.id}/rating`,
    { stars: 5, comment: 'C01隔离冒烟测试' },
    wife.token,
    [201, 200],
  );
  await call('历史餐单读取', 'GET', '/orders', null, wife.token, [200]);
} catch (e) {
  evidence.push({ error: e.message });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    'docs/audit-logs/61-api-smoke.json',
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope: '虚构数据、本机服务、原始业务流程；微信登录和新需求未验收',
        evidence,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      evidence.map((e) => ({ name: e.name, status: e.status, error: e.error })),
      null,
      2,
    ),
  );
}
