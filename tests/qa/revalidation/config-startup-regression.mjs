import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { parse } = requireFromBackend('dotenv');
const envFile = process.env.C03_PRODUCTION_ENV_FILE;
if (!envFile) throw new Error('C03_PRODUCTION_ENV_FILE is required');
const repo = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const base = { ...process.env, ...parse(readFileSync(envFile)) };

const cases = [
  {
    name: 'admin-enabled-missing',
    patch: { ADMIN_ENABLED: 'true', ADMIN_USERNAME: undefined, ADMIN_PASSWORD: undefined },
    expected: 'requires non-empty ADMIN_USERNAME and ADMIN_PASSWORD',
  },
  {
    name: 'admin-enabled-empty',
    patch: { ADMIN_ENABLED: 'true', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' },
    expected: 'requires non-empty ADMIN_USERNAME and ADMIN_PASSWORD',
  },
  {
    name: 'admin-enabled-partial',
    patch: { ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'c03-only', ADMIN_PASSWORD: undefined },
    expected: 'requires non-empty ADMIN_USERNAME and ADMIN_PASSWORD',
  },
  {
    name: 'admin-enabled-legacy-default',
    patch: { ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin123456' },
    expected: 'ADMIN_PASSWORD with at least 12 characters',
  },
  {
    name: 'production-password-switch-rejected',
    patch: { PASSWORD_LOGIN_ENABLED: 'true' },
    expected: 'PASSWORD_LOGIN_ENABLED cannot be enabled in production',
  },
];

const results = cases.map((testCase) => {
  const env = { ...base };
  for (const [key, value] of Object.entries(testCase.patch)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  const child = spawnSync(process.execPath, ['backend/dist/main.js'], {
    cwd: repo,
    env,
    encoding: 'utf8',
    timeout: 15000,
  });
  const output = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
  return {
    name: testCase.name,
    pass: child.status === 1 && output.includes(testCase.expected),
    exitCode: child.status,
    expectedValidationObserved: output.includes(testCase.expected),
    spawnError: child.error?.code ?? null,
  };
});

const failed = results.filter((result) => !result.pass);
console.log(
  JSON.stringify(
    {
      summary: {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
      },
      results,
    },
    null,
    2,
  ),
);
if (failed.length) process.exitCode = 1;
