import { createRequire } from 'node:module';

const requireFromBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { PrismaClient } = requireFromBackend('@prisma/client');

const api = process.env.C01_API_BASE || 'http://127.0.0.1:33500/api/v1';
const password = process.env.C01_TEST_PASSWORD;
if (!password || !process.env.DATABASE_URL) {
  throw new Error('C01_TEST_PASSWORD and DATABASE_URL are required');
}

const prisma = new PrismaClient();
const results = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${api}${path}`, init);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

function check(name, condition, actual) {
  results.push({ name, pass: Boolean(condition), actual });
  if (!condition) process.exitCode = 1;
}

async function login(phone, gender) {
  const response = await request('POST', '/auth/password-login', {
    body: { phone, password, gender },
  });
  check(`login-${phone.slice(-2)}`, response.status === 200, response.status);
  return response.body;
}

async function upload(token, category) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  return request('POST', `/storage/upload?category=${category}`, { token, body: form });
}

const husband = await login('13900006001', 'male');
const wife = await login('13900006002', 'female');
const outsider = await login('13900006003', 'male');
const family = (
  await request('POST', '/families', { token: husband.token, body: { name: 'C01-006家庭A' } })
).body;
const invite = (await request('POST', '/families/me/invite-code', { token: husband.token })).body;
await request('POST', '/families/join', {
  token: wife.token,
  body: { inviteCode: invite.inviteCode },
});
await request('POST', '/families', {
  token: outsider.token,
  body: { name: 'C01-006家庭B' },
});

const uploaded = await upload(husband.token, 'recipe');
check('upload-stable-key', uploaded.status === 201 && uploaded.body.key.startsWith(`family/${family.id}/recipe/`), {
  status: uploaded.status,
  key: uploaded.body?.key,
});
const key = uploaded.body.key;
const recipe = (
  await request('POST', '/recipes', {
    token: husband.token,
    body: { name: 'C01并发测试菜', imageUrls: [key] },
  })
).body;
const persistedRecipe = await prisma.recipe.findUniqueOrThrow({ where: { id: recipe.id } });
check('recipe-persists-key', persistedRecipe.imageUrls[0] === key, persistedRecipe.imageUrls);

await new Promise((resolve) => setTimeout(resolve, 3100));
const expired = await fetch(uploaded.body.url);
check('old-signed-url-expired', expired.status === 403, expired.status);
const reread = await request('GET', `/recipes/${recipe.id}`, { token: wife.token });
check('recipe-reread-keeps-key', reread.body.imageUrls[0] === key, reread.body.imageUrls);
const refreshed = await request('GET', `/storage/url?key=${encodeURIComponent(key)}`, {
  token: wife.token,
});
const refreshedFetch = await fetch(refreshed.body.url);
check('expired-link-refreshes-after-auth', refreshed.status === 200 && refreshedFetch.status === 200, {
  api: refreshed.status,
  object: refreshedFetch.status,
});
const crossFamily = await request('GET', `/storage/url?key=${encodeURIComponent(key)}`, {
  token: outsider.token,
});
check('cross-family-refresh-denied', crossFamily.status === 403, crossFamily);

const edits = await Promise.all([
  request('PATCH', `/recipes/${recipe.id}`, {
    token: husband.token,
    body: { imageUrls: [key] },
  }),
  request('PATCH', `/recipes/${recipe.id}`, {
    token: husband.token,
    body: { imageUrls: [key] },
  }),
]);
check('repeat-edit-keeps-stable-ref', edits.every((item) => item.status === 200), edits.map((item) => item.status));

const inUseDelete = await request('DELETE', `/storage/object?key=${encodeURIComponent(key)}`, {
  token: husband.token,
});
check(
  'referenced-object-delete-blocked',
  inUseDelete.status === 409 && inUseDelete.body?.code === 'STORAGE_OBJECT_IN_USE',
  inUseDelete,
);

const order = (
  await request('POST', '/orders', {
    token: wife.token,
    body: { chefUserId: husband.user.id, items: [{ recipeId: recipe.id }] },
  })
).body;
const accepts = await Promise.all([
  request('POST', `/orders/${order.id}/accept`, { token: husband.token, body: {} }),
  request('POST', `/orders/${order.id}/accept`, { token: husband.token, body: {} }),
]);
check(
  'concurrent-accept-one-write',
  accepts.filter((item) => item.status === 200).length === 1 &&
    accepts.some((item) => item.body?.code === 'ORDER_VERSION_CONFLICT'),
  accepts.map((item) => ({ status: item.status, code: item.body?.code })),
);
await new Promise((resolve) => setTimeout(resolve, 300));
const notificationCount = await prisma.notificationLog.count({
  where: { userId: wife.user.id, type: 'order_accepted' },
});
check('accept-side-effect-once', notificationCount === 1, notificationCount);
const afterAccept = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
check('accept-db-state-once', afterAccept.status === 'accepted', afterAccept.status);

const prepping = await Promise.all([
  request('POST', `/orders/${order.id}/prepping`, { token: husband.token }),
  request('POST', `/orders/${order.id}/prepping`, { token: husband.token }),
]);
check(
  'concurrent-prepping-one-write',
  prepping.filter((item) => item.status === 200).length === 1 &&
    prepping.some((item) => item.body?.code === 'ORDER_VERSION_CONFLICT'),
  prepping.map((item) => ({ status: item.status, code: item.body?.code })),
);
const retry = await request('POST', `/orders/${order.id}/prepping`, { token: husband.token });
check('completed-operation-retry-not-reexecuted', retry.status === 400, retry);
const afterPrepping = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
check('prepping-db-state-once', afterPrepping.status === 'prepping', afterPrepping.status);

const orphan = await upload(wife.token, 'other');
const deleted = await request('DELETE', `/storage/object?key=${encodeURIComponent(orphan.body.key)}`, {
  token: wife.token,
});
const deletedRefresh = await request('GET', `/storage/url?key=${encodeURIComponent(orphan.body.key)}`, {
  token: wife.token,
});
check('unreferenced-delete-and-refresh-rejected', deleted.status === 200 && deletedRefresh.status === 400, {
  deleted: deleted.status,
  refreshed: deletedRefresh.status,
  code: deletedRefresh.body?.code,
});

await prisma.recipe.create({
  data: {
    familyId: family.id,
    createdByUserId: husband.user.id,
    name: 'C01迁移验证菜',
    imageUrls: [uploaded.body.url],
  },
});
check('legacy-signed-url-migration-fixture-created', uploaded.body.url.includes('X-Amz-Signature='), {
  familyId: family.id,
  imageUrl: uploaded.body.url,
});

const passed = results.filter((item) => item.pass).length;
console.log(JSON.stringify({ summary: { total: results.length, passed, failed: results.length - passed }, results }, null, 2));
await prisma.$disconnect();
