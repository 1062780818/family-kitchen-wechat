import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the first-release client exposes only the WeChat login path', async () => {
  const files = ['src/api/auth.js', 'src/stores/auth.js', 'src/pages/auth/login.vue'];
  for (const file of files) {
    const source = await readFile(resolve(root, file), 'utf8');
    assert.equal(source.includes('passwordLogin'), false, file);
    assert.equal(source.includes('/auth/password-login'), false, file);
  }
  const api = await readFile(resolve(root, 'src/api/auth.js'), 'utf8');
  assert.equal(api.includes('/auth/wx-login'), true);
});
