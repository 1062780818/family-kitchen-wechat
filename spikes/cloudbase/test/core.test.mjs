import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AccessDeniedError,
  AtomicMemoryRepository,
  ConflictError,
  PrivatePhotoStore,
  idempotentWrite,
  trustedWechatIdentity,
} from '../src/core.mjs';

const members = [
  { familyId: 'family-a', actorId: 'wx-wife-a', role: 'orderer', status: 'active' },
  { familyId: 'family-a', actorId: 'wx-chef-a', role: 'chef', status: 'active' },
  { familyId: 'family-b', actorId: 'wx-wife-b', role: 'orderer', status: 'active' },
];

test('identity only accepts trusted server context and ignores request-shaped objects', () => {
  assert.deepEqual(trustedWechatIdentity({ openId: 'wx-wife-a' }), {
    actorId: 'wx-wife-a',
    source: 'trusted-server-context',
  });
  assert.throws(() => trustedWechatIdentity({ event: { openid: 'forged' } }), AccessDeniedError);
  assert.throws(() => trustedWechatIdentity({ openId: 'x', isAnonymous: true }), AccessDeniedError);
});

test('family write allows active member and rejects another family', () => {
  const repository = new AtomicMemoryRepository();
  const wifeA = trustedWechatIdentity({ openId: 'wx-wife-a' });
  const wifeB = trustedWechatIdentity({ openId: 'wx-wife-b' });
  const input = {
    repository,
    members,
    familyId: 'family-a',
    requestId: 'request-1',
    payload: { value: 1 },
  };
  assert.equal(idempotentWrite({ ...input, identity: wifeA }).replayed, false);
  assert.throws(() => idempotentWrite({ ...input, identity: wifeB }), AccessDeniedError);
});

test('same request and payload replays one result', () => {
  const repository = new AtomicMemoryRepository();
  const input = {
    repository,
    members,
    identity: trustedWechatIdentity({ openId: 'wx-wife-a' }),
    familyId: 'family-a',
    requestId: 'request-repeat',
    payload: { note: '测试', nested: { b: 2, a: 1 } },
  };
  const first = idempotentWrite(input);
  const second = idempotentWrite({ ...input, payload: { nested: { a: 1, b: 2 }, note: '测试' } });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(first.id, second.id);
  assert.equal(repository.size, 1);
});

test('same request with changed payload is a conflict', () => {
  const repository = new AtomicMemoryRepository();
  const common = {
    repository,
    members,
    identity: trustedWechatIdentity({ openId: 'wx-wife-a' }),
    familyId: 'family-a',
    requestId: 'request-conflict',
  };
  idempotentWrite({ ...common, payload: { value: 1 } });
  assert.throws(() => idempotentWrite({ ...common, payload: { value: 2 } }), ConflictError);
  assert.equal(repository.size, 1);
});

test('concurrent retries preserve one local result', async () => {
  const repository = new AtomicMemoryRepository();
  const input = {
    repository,
    members,
    identity: trustedWechatIdentity({ openId: 'wx-wife-a' }),
    familyId: 'family-a',
    requestId: 'request-concurrent',
    payload: { value: 1 },
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, () => Promise.resolve().then(() => idempotentWrite(input))),
  );
  assert.equal(results.filter((item) => !item.replayed).length, 1);
  assert.equal(repository.size, 1);
});

test('private test image is readable by same family but not another family', () => {
  const store = new PrivatePhotoStore(members);
  const wifeA = trustedWechatIdentity({ openId: 'wx-wife-a' });
  const chefA = trustedWechatIdentity({ openId: 'wx-chef-a' });
  const wifeB = trustedWechatIdentity({ openId: 'wx-wife-b' });
  store.upload({
    identity: wifeA,
    familyId: 'family-a',
    fileId: 'fake-test-image',
    bytes: Buffer.from('not-a-real-family-photo'),
    contentType: 'image/png',
  });
  assert.equal(store.read({ identity: chefA, fileId: 'fake-test-image' }).familyId, 'family-a');
  assert.throws(
    () => store.read({ identity: wifeB, fileId: 'fake-test-image' }),
    AccessDeniedError,
  );
});

test('test image deletion requires its owner', () => {
  const store = new PrivatePhotoStore(members);
  const wifeA = trustedWechatIdentity({ openId: 'wx-wife-a' });
  const chefA = trustedWechatIdentity({ openId: 'wx-chef-a' });
  store.upload({
    identity: wifeA,
    familyId: 'family-a',
    fileId: 'to-delete',
    bytes: Buffer.from('x'),
    contentType: 'image/jpeg',
  });
  assert.throws(() => store.delete({ identity: chefA, fileId: 'to-delete' }), AccessDeniedError);
  assert.equal(store.delete({ identity: wifeA, fileId: 'to-delete' }), true);
  assert.equal(store.read({ identity: wifeA, fileId: 'to-delete' }), null);
});

test('draft rules deny all direct client database and storage access', async () => {
  for (const file of ['database.rules.json', 'storage.rules.json']) {
    const rules = JSON.parse(await readFile(new URL(`../rules/${file}`, import.meta.url), 'utf8'));
    assert.deepEqual(rules, { read: false, write: false });
  }
});
