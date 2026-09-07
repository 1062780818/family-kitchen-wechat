import { createRequire } from 'node:module';

const requireFromBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { PrismaClient } = requireFromBackend('@prisma/client');

const api = process.env.C03_API_BASE;
const password = process.env.C03_TEST_PASSWORD;
const objectBase = process.env.C03_OBJECT_BASE;
if (!api || !password || !objectBase || !process.env.DATABASE_URL) {
  throw new Error('C03_API_BASE, C03_TEST_PASSWORD, C03_OBJECT_BASE and DATABASE_URL are required');
}

const prisma = new PrismaClient();
const results = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

async function request(method, path, { token, body, extraHeaders = {} } = {}) {
  const headers = { ...extraHeaders };
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

function expectStatus(name, response, statuses) {
  check(name, statuses.includes(response.status), {
    status: response.status,
    code: response.body?.code ?? null,
  });
  return response;
}

async function login(phone, gender) {
  const response = await request('POST', '/auth/password-login', {
    body: { phone, password, gender },
  });
  expectStatus(`login-${phone.slice(-2)}`, response, [200]);
  check(`login-token-${phone.slice(-2)}`, typeof response.body?.token === 'string', {
    hasToken: typeof response.body?.token === 'string',
  });
  return {
    token: response.body.token,
    userId: response.body.user.id,
    familyId: response.body.user.currentFamilyId,
  };
}

async function upload(token, category) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'c03-pixel.png');
  return request('POST', `/storage/upload?category=${encodeURIComponent(category)}`, {
    token,
    body: form,
  });
}

const husband = await login('13900006431', 'male');
const wife = await login('13900006432', 'female');
const outsider = await login('13900006433', 'male');
const family = expectStatus(
  'create-independent-family-a',
  await request('POST', '/families', {
    token: husband.token,
    body: { name: 'C03-004独立家庭A' },
  }),
  [201],
).body;
const invite = expectStatus(
  'create-independent-invite',
  await request('POST', '/families/me/invite-code', { token: husband.token }),
  [200],
).body;
expectStatus(
  'wife-joins-independent-family',
  await request('POST', '/families/join', {
    token: wife.token,
    body: { inviteCode: invite.inviteCode },
  }),
  [200],
);
const outsiderFamily = expectStatus(
  'create-independent-family-b',
  await request('POST', '/families', {
    token: outsider.token,
    body: { name: 'C03-004独立家庭B' },
  }),
  [201],
).body;
husband.familyId = family.id;
wife.familyId = family.id;
outsider.familyId = outsiderFamily.id;
check('fixture-families-remain-isolated', husband.familyId === wife.familyId && husband.familyId !== outsider.familyId, {
  husbandFamily: husband.familyId,
  wifeFamily: wife.familyId,
  outsiderFamily: outsider.familyId,
});

const spoof = await request('GET', '/auth/me', {
  token: wife.token,
  extraHeaders: {
    'x-user-id': husband.userId,
    'x-family-id': outsider.familyId,
    'x-role': 'creator',
  },
});
expectStatus('frontend-identity-family-role-spoof-ignored', spoof, [200]);
check('spoof-still-token-subject', spoof.body?.userId === wife.userId, {
  returnedUserId: spoof.body?.userId,
  returnedFamilyId: spoof.body?.familyId,
  returnedRole: spoof.body?.membershipRole,
});
expectStatus('invalid-jwt-rejected', await request('GET', '/auth/me', { token: 'not-a-valid-token' }), [401]);

const baseRecipe = (
  await request('POST', '/recipes', {
    token: husband.token,
    body: { name: `C03-004并发菜-${Date.now()}`, imageUrls: [] },
  })
).body;
const order = (
  await request('POST', '/orders', {
    token: wife.token,
    body: { chefUserId: husband.userId, items: [{ recipeId: baseRecipe.id }] },
  })
).body;
expectStatus('wife-cannot-accept', await request('POST', `/orders/${order.id}/accept`, { token: wife.token, body: {} }), [403]);
expectStatus('outsider-cannot-accept', await request('POST', `/orders/${order.id}/accept`, { token: outsider.token, body: {} }), [403]);
expectStatus('prepping-before-accept-rejected', await request('POST', `/orders/${order.id}/prepping`, { token: husband.token }), [400]);

const notificationBefore = await prisma.notificationLog.count({
  where: { userId: wife.userId, type: 'order_accepted' },
});
const acceptResults = await Promise.all([
  request('POST', `/orders/${order.id}/accept`, { token: husband.token, body: {} }),
  request('POST', `/orders/${order.id}/accept`, { token: husband.token, body: {} }),
]);
check(
  'concurrent-accept-one-success-one-version-conflict',
  acceptResults.filter((item) => item.status === 200).length === 1 &&
    acceptResults.filter(
      (item) => item.status === 409 && item.body?.code === 'ORDER_VERSION_CONFLICT',
    ).length === 1,
  acceptResults.map((item) => ({ status: item.status, code: item.body?.code ?? null })),
);
await new Promise((resolve) => setTimeout(resolve, 300));
const notificationAfter = await prisma.notificationLog.count({
  where: { userId: wife.userId, type: 'order_accepted' },
});
check('accept-notification-side-effect-exactly-once', notificationAfter - notificationBefore === 1, {
  before: notificationBefore,
  after: notificationAfter,
  delta: notificationAfter - notificationBefore,
});
let dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
check('accept-db-state-is-accepted', dbOrder.status === 'accepted', { status: dbOrder.status });
expectStatus('completed-accept-retry-rejected', await request('POST', `/orders/${order.id}/accept`, { token: husband.token, body: {} }), [400]);
expectStatus('conflicting-reject-after-accept-rejected', await request('POST', `/orders/${order.id}/reject`, { token: husband.token, body: {} }), [400]);

const preppingResults = await Promise.all([
  request('POST', `/orders/${order.id}/prepping`, { token: husband.token }),
  request('POST', `/orders/${order.id}/prepping`, { token: husband.token }),
]);
check(
  'concurrent-prepping-one-success-one-version-conflict',
  preppingResults.filter((item) => item.status === 200).length === 1 &&
    preppingResults.filter(
      (item) => item.status === 409 && item.body?.code === 'ORDER_VERSION_CONFLICT',
    ).length === 1,
  preppingResults.map((item) => ({ status: item.status, code: item.body?.code ?? null })),
);
expectStatus('completed-prepping-retry-rejected', await request('POST', `/orders/${order.id}/prepping`, { token: husband.token }), [400]);
dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
check('prepping-db-state-is-prepping', dbOrder.status === 'prepping', { status: dbOrder.status });
expectStatus('wife-cannot-start-cooking', await request('POST', `/orders/${order.id}/cooking`, { token: wife.token }), [403]);
expectStatus('outsider-cannot-start-cooking', await request('POST', `/orders/${order.id}/cooking`, { token: outsider.token }), [403]);
expectStatus('authorized-cooking-still-works', await request('POST', `/orders/${order.id}/cooking`, { token: husband.token }), [200]);
expectStatus('completed-cooking-retry-rejected', await request('POST', `/orders/${order.id}/cooking`, { token: husband.token }), [400]);

const recipeUpload = expectStatus('recipe-upload', await upload(husband.token, 'recipe'), [201]).body;
const timelineUpload = expectStatus('timeline-upload', await upload(wife.token, 'timeline'), [201]).body;
const avatarUpload = expectStatus('avatar-upload', await upload(wife.token, 'avatar'), [201]).body;
const servedUpload = expectStatus('served-upload', await upload(husband.token, 'order-served'), [201]).body;
const outsiderUpload = expectStatus('outsider-recipe-upload', await upload(outsider.token, 'recipe'), [201]).body;

const imageRecipe = expectStatus(
  'recipe-persists-stable-key-api',
  await request('POST', '/recipes', {
    token: husband.token,
    body: { name: `C03-004图片菜-${Date.now()}`, imageUrls: [recipeUpload.key] },
  }),
  [201],
).body;
let dbRecipe = await prisma.recipe.findUniqueOrThrow({ where: { id: imageRecipe.id } });
check('recipe-db-has-key-not-signed-url', dbRecipe.imageUrls[0] === recipeUpload.key && !String(dbRecipe.imageUrls[0]).includes('X-Amz-'), dbRecipe.imageUrls);
expectStatus(
  'recipe-rejects-temporary-signed-url',
  await request('PATCH', `/recipes/${imageRecipe.id}`, {
    token: husband.token,
    body: { imageUrls: [recipeUpload.url] },
  }),
  [400],
);
expectStatus(
  'recipe-rejects-wrong-category-key',
  await request('PATCH', `/recipes/${imageRecipe.id}`, {
    token: husband.token,
    body: { imageUrls: [timelineUpload.key] },
  }),
  [400],
);
expectStatus(
  'recipe-rejects-cross-family-key',
  await request('PATCH', `/recipes/${imageRecipe.id}`, {
    token: husband.token,
    body: { imageUrls: [outsiderUpload.key] },
  }),
  [403],
);
const tamperedKey = recipeUpload.key.replace(/([A-Za-z0-9])(?=\.png$)/, (match) => (match === 'A' ? 'B' : 'A'));
expectStatus(
  'recipe-rejects-tampered-nonexistent-key',
  await request('PATCH', `/recipes/${imageRecipe.id}`, {
    token: husband.token,
    body: { imageUrls: [tamperedKey] },
  }),
  [400],
);
expectStatus(
  'recipe-repeat-save-stable-key-1',
  await request('PATCH', `/recipes/${imageRecipe.id}`, {
    token: husband.token,
    body: { imageUrls: [recipeUpload.key] },
  }),
  [200],
);
expectStatus(
  'recipe-repeat-save-stable-key-2',
  await request('PATCH', `/recipes/${imageRecipe.id}`, {
    token: husband.token,
    body: { imageUrls: [recipeUpload.key] },
  }),
  [200],
);
dbRecipe = await prisma.recipe.findUniqueOrThrow({ where: { id: imageRecipe.id } });
check('recipe-repeat-save-db-still-key', dbRecipe.imageUrls[0] === recipeUpload.key, dbRecipe.imageUrls);

const timeline = expectStatus(
  'timeline-persists-stable-key',
  await request('POST', '/timeline/manual', {
    token: wife.token,
    body: { occurredAt: new Date().toISOString(), imageUrls: [timelineUpload.key], comment: 'C03虚构图片' },
  }),
  [201],
).body;
const dbTimeline = await prisma.timelineEntry.findUniqueOrThrow({ where: { id: timeline.id } });
check('timeline-db-has-key-not-url', dbTimeline.imageUrls[0] === timelineUpload.key, dbTimeline.imageUrls);
expectStatus(
  'timeline-rejects-temporary-url',
  await request('POST', '/timeline/manual', {
    token: wife.token,
    body: { occurredAt: new Date().toISOString(), imageUrls: [timelineUpload.url] },
  }),
  [400],
);

expectStatus(
  'avatar-persists-stable-key',
  await request('PATCH', '/users/me', { token: wife.token, body: { avatarUrl: avatarUpload.key } }),
  [200],
);
const dbWife = await prisma.user.findUniqueOrThrow({ where: { id: wife.userId } });
check('avatar-db-has-key-not-url', dbWife.avatarUrl === avatarUpload.key, { avatarUrl: dbWife.avatarUrl });
expectStatus(
  'avatar-rejects-temporary-url',
  await request('PATCH', '/users/me', { token: wife.token, body: { avatarUrl: avatarUpload.url } }),
  [409],
);

expectStatus(
  'serve-rejects-temporary-url',
  await request('POST', `/orders/${order.id}/serve`, {
    token: husband.token,
    body: { imageUrls: [servedUpload.url] },
  }),
  [400],
);
dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
check('rejected-temporary-serve-keeps-cooking', dbOrder.status === 'cooking', { status: dbOrder.status });
expectStatus(
  'serve-persists-stable-key',
  await request('POST', `/orders/${order.id}/serve`, {
    token: husband.token,
    body: { imageUrls: [servedUpload.key] },
  }),
  [200],
);
dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
check('served-db-has-key-not-url', dbOrder.servedImageUrls[0] === servedUpload.key, dbOrder.servedImageUrls);

await new Promise((resolve) => setTimeout(resolve, 3100));
const expired = await fetch(recipeUpload.url);
check('original-two-second-url-expires', expired.status === 403, { status: expired.status });
const reread = expectStatus('authorized-recipe-reread-after-expiry', await request('GET', `/recipes/${imageRecipe.id}`, { token: wife.token }), [200]).body;
check('reread-preserves-stable-reference', reread.imageUrls[0] === recipeUpload.key, reread.imageUrls);
const refreshed = expectStatus(
  'authorized-user-can-refresh-expired-image',
  await request('GET', `/storage/url?key=${encodeURIComponent(recipeUpload.key)}`, { token: wife.token }),
  [200],
).body;
const refreshedObject = await fetch(refreshed.url);
check('refreshed-url-reads-real-object', refreshedObject.status === 200, { status: refreshedObject.status });
expectStatus(
  'cross-family-image-refresh-rejected',
  await request('GET', `/storage/url?key=${encodeURIComponent(recipeUpload.key)}`, { token: outsider.token }),
  [403],
);
expectStatus(
  'cross-family-image-delete-rejected',
  await request('DELETE', `/storage/object?key=${encodeURIComponent(recipeUpload.key)}`, { token: outsider.token }),
  [403],
);
expectStatus(
  'in-use-image-delete-rejected',
  await request('DELETE', `/storage/object?key=${encodeURIComponent(recipeUpload.key)}`, { token: husband.token }),
  [409],
);
const directUrl = `${objectBase.replace(/\/$/, '')}/${recipeUpload.key}`;
const directRead = await fetch(directUrl);
check('private-bucket-direct-read-rejected', directRead.status === 403, { status: directRead.status });

const orphan = expectStatus('orphan-upload', await upload(wife.token, 'other'), [201]).body;
expectStatus(
  'orphan-owner-delete',
  await request('DELETE', `/storage/object?key=${encodeURIComponent(orphan.key)}`, { token: wife.token }),
  [200],
);
expectStatus(
  'deleted-object-cannot-be-resigned',
  await request('GET', `/storage/url?key=${encodeURIComponent(orphan.key)}`, { token: wife.token }),
  [400],
);

const passed = results.filter((item) => item.pass).length;
console.log(
  JSON.stringify(
    { summary: { total: results.length, passed, failed: results.length - passed }, results },
    null,
    2,
  ),
);
await prisma.$disconnect();
