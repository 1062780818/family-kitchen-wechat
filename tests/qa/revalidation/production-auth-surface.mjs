const api = process.env.C03_API_BASE;
const password = process.env.C03_TEST_PASSWORD;
if (!api || !password) throw new Error('C03_API_BASE and C03_TEST_PASSWORD are required');

async function request(method, path, body, token, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, body: payload };
}

const results = [];
function check(name, pass, actual) {
  results.push({ name, pass: Boolean(pass), actual });
  if (!pass) process.exitCode = 1;
}

const admin = await request('POST', '/auth/admin/login', {
  username: 'admin',
  password: 'admin123456',
});
check('missing-admin-config-falls-back-to-fixed-default', admin.status === 200 && typeof admin.body?.token === 'string', {
  status: admin.status,
  issuedToken: typeof admin.body?.token === 'string',
});
const adminUsers = await request('GET', '/admin/users?page=1&pageSize=1', undefined, admin.body?.token);
check('default-admin-token-accesses-protected-user-data', adminUsers.status === 200, {
  status: adminUsers.status,
  exposesUserList: Array.isArray(adminUsers.body?.items),
});

const registration = await request('POST', '/auth/password-login', {
  phone: '13900006492',
  password,
  gender: 'female',
});
check(
  'production-password-endpoint-self-registers',
  registration.status === 200 && registration.body?.isNewUser === true && typeof registration.body?.token === 'string',
  {
    status: registration.status,
    isNewUser: registration.body?.isNewUser,
    issuedToken: typeof registration.body?.token === 'string',
  },
);

const me = await request(
  'GET',
  '/auth/me',
  undefined,
  registration.body?.token,
  { 'x-user-id': 'forged-user', 'x-family-id': 'forged-family', 'x-role': 'creator' },
);
check('issued-user-jwt-resolves-server-identity', me.status === 200 && me.body?.userId === registration.body?.user?.id, {
  status: me.status,
  userIdMatches: me.body?.userId === registration.body?.user?.id,
  familyId: me.body?.familyId ?? null,
  membershipRole: me.body?.membershipRole ?? null,
});

const wrongPassword = await request('POST', '/auth/password-login', {
  phone: '13900006492',
  password: `${password}-wrong`,
  gender: 'female',
});
check('wrong-password-rejected', wrongPassword.status === 401 && wrongPassword.body?.code === 'BAD_CREDENTIALS', {
  status: wrongPassword.status,
  code: wrongPassword.body?.code,
});

const anonymous = await request('GET', '/auth/me');
check('missing-token-does-not-fall-back-to-test-identity', anonymous.status === 401, {
  status: anonymous.status,
  code: anonymous.body?.code,
});

const passed = results.filter((item) => item.pass).length;
console.log(JSON.stringify({ summary: { total: results.length, passed, failed: results.length - passed }, results }, null, 2));
