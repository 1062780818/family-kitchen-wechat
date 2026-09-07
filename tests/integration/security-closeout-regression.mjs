import { createRequire } from 'node:module';

const requireFromBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { JwtService } = requireFromBackend('@nestjs/jwt');

const api = process.env.C01_API_BASE;
const jwtSecret = process.env.C01_JWT_SECRET;
const mode = process.env.C01_ADMIN_EXPECTED_MODE || 'disabled';
const configuredUsername = process.env.C01_ADMIN_USERNAME;
const configuredPassword = process.env.C01_ADMIN_PASSWORD;
if (!api || !jwtSecret) throw new Error('C01_API_BASE and C01_JWT_SECRET are required');
if (mode === 'enabled' && (!configuredUsername || !configuredPassword)) {
  throw new Error('enabled mode requires C01_ADMIN_USERNAME and C01_ADMIN_PASSWORD');
}

const results = [];
async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {}
  return { status: response.status, body: payload };
}

function check(name, condition, actual) {
  results.push({ name, pass: Boolean(condition), actual });
  if (!condition) process.exitCode = 1;
}

const passwordEntry = await request('POST', '/auth/password-login', {
  body: { phone: '13900007001', password: 'C01-isolated-only-007!', gender: 'male' },
});
check(
  'production-password-entry-denied',
  passwordEntry.status === 403 && passwordEntry.body?.code === 'PASSWORD_LOGIN_DISABLED',
  { status: passwordEntry.status, code: passwordEntry.body?.code },
);

const legacyAdmin = await request('POST', '/auth/admin/login', {
  body: { username: 'admin', password: 'admin123456' },
});
check(
  'legacy-default-admin-denied',
  [401, 403].includes(legacyAdmin.status),
  { status: legacyAdmin.status, code: legacyAdmin.body?.code },
);

const forgedToken = await new JwtService().signAsync(
  { sub: 'admin:legacy', isAdmin: true },
  { secret: jwtSecret, expiresIn: '5m' },
);
const directAdmin = await request('GET', '/admin/users', { token: forgedToken });

if (mode === 'disabled') {
  check(
    'disabled-admin-login-denied',
    legacyAdmin.status === 403 && legacyAdmin.body?.code === 'ADMIN_ACCESS_DISABLED',
    { status: legacyAdmin.status, code: legacyAdmin.body?.code },
  );
  check(
    'disabled-admin-direct-api-denied',
    directAdmin.status === 403 && directAdmin.body?.code === 'ADMIN_ACCESS_DISABLED',
    { status: directAdmin.status, code: directAdmin.body?.code },
  );
} else {
  check(
    'enabled-admin-forged-identity-denied',
    directAdmin.status === 403 && directAdmin.body?.code === 'ADMIN_FORBIDDEN',
    { status: directAdmin.status, code: directAdmin.body?.code },
  );
  const validLogin = await request('POST', '/auth/admin/login', {
    body: { username: configuredUsername, password: configuredPassword },
  });
  check('enabled-admin-valid-login', validLogin.status === 200 && validLogin.body?.token, {
    status: validLogin.status,
    hasToken: Boolean(validLogin.body?.token),
  });
  const validList = await request('GET', '/admin/users', { token: validLogin.body?.token });
  check('enabled-admin-valid-direct-api', validList.status === 200, validList.status);
}

console.log(
  JSON.stringify(
    {
      mode,
      summary: {
        total: results.length,
        passed: results.filter((result) => result.pass).length,
        failed: results.filter((result) => !result.pass).length,
      },
      results,
    },
    null,
    2,
  ),
);
