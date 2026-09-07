import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toStableImageRef } from '../src/utils/storage-ref.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('keeps a stable family key unchanged', () => {
  const key = 'family/f1/recipe/2026-09-07/u1-abcdefghijklmnop.jpg';
  assert.equal(toStableImageRef(key), key);
});

test('recovers a stable key from a legacy MinIO signed URL', () => {
  const url =
    'http://127.0.0.1:9000/bucket/family/f1/avatar/2026-09-07/u1-abcdefghijklmnop.jpg?X-Amz-Signature=fake&X-Amz-Expires=1';
  assert.equal(
    toStableImageRef(url),
    'family/f1/avatar/2026-09-07/u1-abcdefghijklmnop.jpg',
  );
});

test('does not reinterpret an ordinary external image URL', () => {
  const url = 'https://example.invalid/avatar.svg';
  assert.equal(toStableImageRef(url), url);
});

test('upload consumers persist keys rather than temporary URLs', async () => {
  const files = [
    'src/pages/recipe/edit.vue',
    'src/pages/timeline/manual.vue',
    'src/pages/order/detail.vue',
    'src/pages/profile/edit.vue',
  ];
  const forbiddenPersistence = [
    /form\.imageUrls\.push\(u\.url\)/,
    /servedImageUrls\s*:\s*[^\n]*\.url/,
    /orderApi\.serve\([^\n]*\.url/,
    /form\.avatarUrl\s*=\s*r\.url/,
  ];
  for (const file of files) {
    const source = await readFile(resolve(root, file), 'utf8');
    for (const pattern of forbiddenPersistence) {
      assert.equal(pattern.test(source), false, `${file}: ${pattern}`);
    }
  }
});
