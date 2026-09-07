const api = process.env.C03_API_BASE || 'http://127.0.0.1:33400/api/v1';
const objectBase = process.env.C03_OBJECT_BASE || 'http://127.0.0.1:33419/c03-revalidation';
const password = process.env.C03_TEST_PASSWORD;
if (!password) throw new Error('C03_TEST_PASSWORD is required');

const results = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

async function request(method, path, { token, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${api}${path}`, init);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, body: payload };
}

function check(name, condition, actual) {
  const item = { name, pass: Boolean(condition), actual };
  results.push(item);
  if (!condition) process.exitCode = 1;
}

function expectStatus(name, response, expected) {
  check(name, expected.includes(response.status), {
    status: response.status,
    code: response.body?.code ?? null,
  });
  return response;
}

async function login(phone, gender) {
  const response = expectStatus(
    `login-${phone.slice(-2)}`,
    await request('POST', '/auth/password-login', {
      body: { phone, password, gender },
    }),
    [200],
  );
  check(`login-token-${phone.slice(-2)}`, Boolean(response.body?.token), { hasToken: Boolean(response.body?.token) });
  return { token: response.body.token, userId: response.body.user.id };
}

async function upload(token, category) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  return request('POST', `/storage/upload?category=${encodeURIComponent(category)}`, { token, body: form });
}

const husbandA = await login('13900003001', 'male');
const wifeA = await login('13900003002', 'female');
const husbandB = await login('13900003003', 'male');

// Production server still exposes password self-registration. Record as an observation;
// assessment against the WeChat-only product scope is performed in the QA report.
check('production-password-login-observed', true, { status: 200, createsJwt: true });

const familyA = expectStatus('family-a-create', await request('POST', '/families', {
  token: husbandA.token,
  body: { name: 'C03虚构家庭A' },
}), [201]).body;
const invite = expectStatus('family-a-invite', await request('POST', '/families/me/invite-code', {
  token: husbandA.token,
}), [200]).body;
expectStatus('wife-a-join', await request('POST', '/families/join', {
  token: wifeA.token,
  body: { inviteCode: invite.inviteCode },
}), [200]);
const familyB = expectStatus('family-b-create', await request('POST', '/families', {
  token: husbandB.token,
  body: { name: 'C03虚构家庭B' },
}), [201]).body;
check('families-isolated', familyA.id && familyB.id && familyA.id !== familyB.id, {
  distinct: familyA.id !== familyB.id,
});

const meSpoof = expectStatus('identity-header-spoof', await request('GET', '/auth/me', {
  token: wifeA.token,
  headers: { 'x-user-id': husbandA.userId, 'x-family-id': familyA.id, 'x-role': 'creator' },
}), [200]).body;
check('identity-remains-token-subject', meSpoof.userId === wifeA.userId, { returnedOwnIdentity: meSpoof.userId === wifeA.userId });
expectStatus('invalid-token-rejected', await request('GET', '/families/me', { token: 'not-a-valid-jwt' }), [401]);

const husbandRecipeUpload = expectStatus('husband-recipe-upload', await upload(husbandA.token, 'recipe'), [201]).body;
check('family-key-shape', husbandRecipeUpload.key.startsWith(`family/${familyA.id}/recipe/`), { keyShape: husbandRecipeUpload.key.split('/').slice(0, 4).join('/') });
const signedRead = await fetch(husbandRecipeUpload.url);
check('signed-object-read', signedRead.status === 200, { status: signedRead.status });
const signedUrl = new URL(husbandRecipeUpload.url);
check('signed-url-ttl-900', signedUrl.searchParams.get('X-Amz-Expires') === '900', { expires: signedUrl.searchParams.get('X-Amz-Expires') });
const directRead = await fetch(`${objectBase}/${husbandRecipeUpload.key}`);
check('private-direct-read-denied', directRead.status === 403, { status: directRead.status });
const systemRead = await fetch(`${objectBase}/system/default-avatar-male.jpg`);
check('system-anonymous-read', systemRead.status === 200, { status: systemRead.status });

expectStatus('wife-recipe-upload-denied', await upload(wifeA.token, 'recipe'), [403]);
const wifeOtherUpload = expectStatus('wife-other-upload-allowed', await upload(wifeA.token, 'other'), [201]).body;
expectStatus('same-family-signed-url', await request('GET', `/storage/url?key=${encodeURIComponent(husbandRecipeUpload.key)}`, { token: wifeA.token }), [200]);
expectStatus('cross-family-signed-url-denied', await request('GET', `/storage/url?key=${encodeURIComponent(husbandRecipeUpload.key)}`, { token: husbandB.token }), [403]);
expectStatus('traversal-key-denied', await request('GET', `/storage/url?key=${encodeURIComponent('../family/x')}`, { token: husbandA.token }), [400]);
const forgedKey = husbandRecipeUpload.key.replace(familyA.id, familyB.id);
expectStatus('forged-family-key-denied', await request('GET', `/storage/url?key=${encodeURIComponent(forgedKey)}`, { token: husbandA.token }), [403]);
expectStatus('same-family-nonowner-delete-denied', await request('DELETE', `/storage/object?key=${encodeURIComponent(husbandRecipeUpload.key)}`, { token: wifeA.token }), [403]);
expectStatus('cross-family-delete-denied', await request('DELETE', `/storage/object?key=${encodeURIComponent(husbandRecipeUpload.key)}`, { token: husbandB.token }), [403]);
expectStatus('owner-delete-success', await request('DELETE', `/storage/object?key=${encodeURIComponent(husbandRecipeUpload.key)}`, { token: husbandA.token }), [200]);
const deletedRead = await fetch(husbandRecipeUpload.url);
check('deleted-object-not-readable', deletedRead.status === 404, { status: deletedRead.status });
expectStatus('wife-owner-delete-success', await request('DELETE', `/storage/object?key=${encodeURIComponent(wifeOtherUpload.key)}`, { token: wifeA.token }), [200]);

const recipe = expectStatus('husband-recipe-create', await request('POST', '/recipes', {
  token: husbandA.token,
  body: { name: 'C03测试菜', imageUrls: [] },
}), [201]).body;
expectStatus('wife-recipe-list', await request('GET', '/recipes', { token: wifeA.token }), [200]);
expectStatus('wife-recipe-read', await request('GET', `/recipes/${recipe.id}`, { token: wifeA.token }), [200]);
expectStatus('wife-favorite', await request('POST', `/recipes/${recipe.id}/favorite`, { token: wifeA.token }), [200]);
expectStatus('wife-recipe-create-denied', await request('POST', '/recipes', {
  token: wifeA.token,
  headers: { 'x-user-id': husbandA.userId, 'x-family-id': familyA.id, 'x-role': 'creator' },
  body: { name: '妻子不应创建' },
}), [403]);
expectStatus('wife-body-spoof-rejected', await request('POST', '/recipes', {
  token: wifeA.token,
  body: { name: '伪造身份', userId: husbandA.userId, familyId: familyA.id, role: 'creator' },
}), [400]);
expectStatus('wife-recipe-update-denied', await request('PATCH', `/recipes/${recipe.id}`, { token: wifeA.token, body: { name: '越权修改' } }), [403]);
expectStatus('wife-recipe-delete-denied', await request('DELETE', `/recipes/${recipe.id}`, { token: wifeA.token }), [403]);
expectStatus('cross-family-recipe-read-denied', await request('GET', `/recipes/${recipe.id}`, { token: husbandB.token }), [403]);
expectStatus('cross-family-recipe-update-denied', await request('PATCH', `/recipes/${recipe.id}`, { token: husbandB.token, body: { name: '跨家修改' } }), [403]);
expectStatus('husband-recipe-update', await request('PATCH', `/recipes/${recipe.id}`, { token: husbandA.token, body: { name: 'C03测试菜已更新' } }), [200]);

const order = expectStatus('wife-order-create', await request('POST', '/orders', {
  token: wifeA.token,
  body: { chefUserId: husbandA.userId, items: [{ recipeId: recipe.id }], customerNotes: '虚构订单' },
}), [201]).body;
expectStatus('cross-family-order-read-denied', await request('GET', `/orders/${order.id}`, { token: husbandB.token }), [403]);
expectStatus('wife-accept-denied', await request('POST', `/orders/${order.id}/accept`, { token: wifeA.token, body: {} }), [403]);

const acceptResults = await Promise.all([
  request('POST', `/orders/${order.id}/accept`, { token: husbandA.token, body: {} }),
  request('POST', `/orders/${order.id}/accept`, { token: husbandA.token, body: {} }),
]);
check('concurrent-accept-one-success', acceptResults.filter((r) => r.status === 200).length === 1 && acceptResults.filter((r) => r.status !== 200).length === 1, {
  statuses: acceptResults.map((r) => r.status), codes: acceptResults.map((r) => r.body?.code ?? null),
});
expectStatus('repeat-accept-denied', await request('POST', `/orders/${order.id}/accept`, { token: husbandA.token, body: {} }), [400]);

const prepResults = await Promise.all([
  request('POST', `/orders/${order.id}/prepping`, { token: husbandA.token }),
  request('POST', `/orders/${order.id}/prepping`, { token: husbandA.token }),
]);
check('concurrent-prepping-one-success', prepResults.filter((r) => r.status === 200).length === 1 && prepResults.filter((r) => r.status !== 200).length === 1, {
  statuses: prepResults.map((r) => r.status), codes: prepResults.map((r) => r.body?.code ?? null),
});
expectStatus('repeat-prepping-denied', await request('POST', `/orders/${order.id}/prepping`, { token: husbandA.token }), [400]);
expectStatus('husband-cooking-success', await request('POST', `/orders/${order.id}/cooking`, { token: husbandA.token }), [200]);
expectStatus('wife-cancel-after-accepted-requires-request', await request('POST', `/orders/${order.id}/cancel`, { token: wifeA.token, body: { reason: '测试申请规则' } }), [409]);
expectStatus('wife-serve-denied', await request('POST', `/orders/${order.id}/serve`, { token: wifeA.token, body: { imageUrls: ['https://example.invalid/fake.jpg'] } }), [403]);
expectStatus('cross-family-state-change-denied', await request('POST', `/orders/${order.id}/cooking`, { token: husbandB.token }), [403]);
const finalOrder = expectStatus('order-final-read', await request('GET', `/orders/${order.id}`, { token: husbandA.token }), [200]).body;
check('failed-operations-preserve-cooking', finalOrder.status === 'cooking', { status: finalOrder.status });

expectStatus('husband-recipe-delete', await request('DELETE', `/recipes/${recipe.id}`, { token: husbandA.token }), [200]);

const passed = results.filter((item) => item.pass).length;
const failed = results.length - passed;
console.log(JSON.stringify({ summary: { total: results.length, passed, failed }, results }, null, 2));
if (failed) process.exitCode = 1;
