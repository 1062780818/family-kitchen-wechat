// FK-C02-001：仅生成源码盘点证据，不更改业务文件，不请求后端。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'mini-app/src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');
const walk = (p) => fs.readdirSync(p, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(p, e.name)) : [path.join(p, e.name)]);
const unique = (a) => [...new Set(a)].sort();
const all = walk(src).filter((p) => /\.(vue|js)$/.test(p));
const pages = JSON.parse(read('pages.json'));
const inventory = all.map((p) => {
  const text = fs.readFileSync(p, 'utf8');
  const code = text.split('<style')[0];
  const lines = code.split(/\r?\n/);
  return {
    file: path.relative(root, p).replaceAll('\\', '/'),
    imports: unique([...code.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)].map((m) => m[1])),
    tags: unique([...code.matchAll(/<([a-z][\w-]*)\b/g)].map((m) => m[1])),
    apiCalls: unique([...code.matchAll(/\b\w+Api\.\w+/g)].map((m) => m[0])),
    forms: unique([...code.matchAll(/v-model(?:\.[\w-]+)?="([^"]+)"/g)].map((m) => m[1])),
    evidence: lines.flatMap((line, i) => /v-if|v-else|:loading|:disabled|showModal|showActionSheet|showToast|\.on\(|navigateTo|redirectTo|switchTab|reLaunch/.test(line) ? [{ line: i + 1, text: line.trim() }] : []),
  };
});
const missing = pages.pages.filter((p) => !fs.existsSync(path.join(src, p.path + '.vue')));
const unregistered = walk(path.join(src, 'pages')).filter((p) => p.endsWith('.vue')).filter((p) => !pages.pages.some((r) => path.join(src, r.path + '.vue') === p));
assert.equal(missing.length, 0);
assert.equal(unregistered.length, 0);
const tags = unique(inventory.flatMap((p) => p.tags).filter((t) => t.startsWith('wd-')));
const summary = { pages: pages.pages.length, tabs: pages.tabBar.list, customComponents: walk(path.join(src, 'components')).length, stores: walk(path.join(src, 'stores')).length, apiFiles: walk(path.join(src, 'api')).length, wotTags: tags, missing, unregistered };
const evidenceDir = path.join(__dirname, 'evidence');
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, 'source-inventory.json'), JSON.stringify({ summary, inventory }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

// 直接提取原 SFC Options API 对象，仅注入隔离桩；不是端到端测试。
function loadOptions(file, injected = {}) {
  let code = read(file).match(/<script>([\s\S]*?)<\/script>/)[1];
  code = code.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default', 'result =');
  const sandbox = { result: null, setTimeout: () => 0, uni: { showToast() {}, navigateBack() {} }, ...injected };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return sandbox.result;
}
async function probes() {
  const findings = [];
  const create = loadOptions('pages/order/create.vue');
  const ctx = create.data();
  for (const [k, v] of Object.entries(create.methods)) ctx[k] = v.bind(ctx);
  ctx.toggleRecipe({ id: 'r1', name: '菜一' });
  ctx.toggleRecipe({ id: 'r2', name: '菜二' });
  assert.equal(ctx.form.items.length, 2);
  ctx.toggleRecipe({ id: 'r1', name: '菜一' });
  assert.equal(ctx.form.items.length, 1);
  findings.push('多菜本地选择/再次点击移除：通过隔离函数验证；未调用后端。');
  let calls = 0;
  const pending = [];
  const edit = loadOptions('pages/recipe/edit.vue', {
    MEAL_TAGS: [], FLAVOR_TAGS: [],
    recipeApi: { create: () => { calls++; return new Promise((resolve) => pending.push(resolve)); } },
  });
  const editCtx = { ...edit.data(), isEdit: false };
  editCtx.form.name = '审查桩数据';
  const first = edit.methods.handleSave.call(editCtx);
  const second = edit.methods.handleSave.call(editCtx);
  assert.equal(calls, 2);
  pending.forEach((resolve) => resolve());
  await Promise.all([first, second]);
  findings.push('缺陷复现：recipe/edit 连续调用保存两次，会触发两次 create；saving 只改变样式，没有方法级防重。');
  const detail = loadOptions('pages/order/detail.vue', {
    formatTimeShort: () => '', ORDER_STATUS_LABEL: {}, ORDER_STATUS_COLOR: {},
    orderApi: { get: async () => { throw new Error('模拟断网'); } },
  });
  const detailCtx = detail.data();
  await detail.methods.load.call(detailCtx);
  assert.equal(detailCtx.order, null);
  assert.equal('error' in detailCtx, false);
  findings.push('缺陷复现：order/detail 首次请求失败后 order 仍为空，无独立 error 状态；模板根节点 v-if=order。');
  const wsCode = read('api/ws.js');
  const fn = wsCode.match(/function buildWsUrl\(\) \{[\s\S]*?\n\}/)[0];
  const socketUrl = vm.runInNewContext("const apiBase = 'https://example.test/api/v1';" + fn + ';buildWsUrl()', { URL });
  assert.equal(socketUrl, 'wss://example.test:3001');
  findings.push('耦合复现：HTTPS 无显式端口 API 被推导为 wss://example.test:3001；不是同源 443。');
  assert.equal(all.some((p) => fs.readFileSync(p, 'utf8').includes('requestSubscribeMessage')), false);
  findings.push('静态检查：mini-app/src 没有 requestSubscribeMessage 调用；不代表微信订阅通知已验证。');
  fs.writeFileSync(path.join(evidenceDir, 'probe-results.txt'), findings.join('\n') + '\n');
  findings.forEach((line) => console.log(line));
}
probes().catch((err) => { console.error(err); process.exitCode = 1; });
