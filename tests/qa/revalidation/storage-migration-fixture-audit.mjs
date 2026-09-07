import { createRequire } from 'node:module';

const requireFromBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { PrismaClient } = requireFromBackend('@prisma/client');

const mode = process.argv[2];
const api = process.env.C03_API_BASE;
const password = process.env.C03_TEST_PASSWORD;
if (!['seed', 'assert-url', 'assert-key', 'mutate', 'assert-mutated'].includes(mode)) {
  throw new Error('usage: storage-migration-fixture-audit.mjs <seed|assert-url|assert-key|mutate|assert-mutated>');
}
if (!api || !password || !process.env.DATABASE_URL) {
  throw new Error('C03_API_BASE, C03_TEST_PASSWORD and DATABASE_URL are required');
}

const prisma = new PrismaClient();
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
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function login(phone, gender) {
  return request('POST', '/auth/password-login', { body: { phone, password, gender } });
}

async function upload(token, category) {
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'migration-pixel.png');
  return request('POST', `/storage/upload?category=${category}`, { token, body: form });
}

async function fixtures() {
  const trusted = await prisma.recipe.findFirstOrThrow({ where: { name: 'C01迁移验证菜' } });
  const external = await prisma.recipe.findFirst({ where: { name: 'C03迁移保留-外部URL' } });
  const cross = await prisma.recipe.findFirst({ where: { name: 'C03迁移保留-跨家庭' } });
  const missing = await prisma.recipe.findFirst({ where: { name: 'C03迁移保留-对象不存在' } });
  const wife = await prisma.user.findUniqueOrThrow({ where: { phone: '13900006002' } });
  return { trusted, external, cross, missing, wife };
}

if (mode === 'seed') {
  const husbandAuth = await login('13900006001', 'male');
  const outsiderAuth = await login('13900006003', 'male');
  const husband = await prisma.user.findUniqueOrThrow({ where: { phone: '13900006001' } });
  const wife = await prisma.user.findUniqueOrThrow({ where: { phone: '13900006002' } });
  const outsider = await prisma.user.findUniqueOrThrow({ where: { phone: '13900006003' } });
  const outsiderRecipe = await upload(outsiderAuth.token, 'recipe');
  const wrongOwnerAvatar = await upload(husbandAuth.token, 'avatar');
  const missingRecipe = await upload(husbandAuth.token, 'recipe');
  await request('DELETE', `/storage/object?key=${encodeURIComponent(missingRecipe.key)}`, {
    token: husbandAuth.token,
  });

  await prisma.recipe.createMany({
    data: [
      {
        familyId: husband.currentFamilyId,
        createdByUserId: husband.id,
        name: 'C03迁移保留-外部URL',
        imageUrls: ['https://example.invalid/external-image.png'],
      },
      {
        familyId: husband.currentFamilyId,
        createdByUserId: husband.id,
        name: 'C03迁移保留-跨家庭',
        imageUrls: [outsiderRecipe.url],
      },
      {
        familyId: husband.currentFamilyId,
        createdByUserId: husband.id,
        name: 'C03迁移保留-对象不存在',
        imageUrls: [missingRecipe.url],
      },
    ],
  });
  await prisma.user.update({ where: { id: wife.id }, data: { avatarUrl: wrongOwnerAvatar.url } });
  console.log(
    JSON.stringify({
      result: 'SEEDED',
      familyA: husband.currentFamilyId,
      familyB: outsider.currentFamilyId,
      crossFamilyUrlRetained: outsiderRecipe.url.includes(String(outsider.currentFamilyId)),
      missingObjectUrlSeeded: missingRecipe.url.includes('X-Amz-Signature='),
      wrongAvatarOwnerSeeded: wrongOwnerAvatar.key.includes(husband.id),
    }),
  );
} else if (mode === 'mutate') {
  const { trusted } = await fixtures();
  await prisma.recipe.update({
    where: { id: trusted.id },
    data: { imageUrls: ['https://example.invalid/post-migration-edit.png'] },
  });
  console.log(JSON.stringify({ result: 'MUTATED_AFTER_MIGRATION', recipeId: trusted.id }));
} else {
  const { trusted, external, cross, missing, wife } = await fixtures();
  if (!external || !cross || !missing) throw new Error('ambiguous fixtures are missing');
  const trustedValue = trusted.imageUrls[0];
  const expectedTrusted =
    mode === 'assert-url'
      ? typeof trustedValue === 'string' && trustedValue.includes('X-Amz-Signature=')
      : mode === 'assert-key'
        ? typeof trustedValue === 'string' && trustedValue.startsWith(`family/${trusted.familyId}/recipe/`) && !trustedValue.includes('?')
        : trustedValue === 'https://example.invalid/post-migration-edit.png';
  const assertions = {
    trustedStateMatches: expectedTrusted,
    externalUnchanged: external.imageUrls[0] === 'https://example.invalid/external-image.png',
    crossFamilyUnchanged:
      typeof cross.imageUrls[0] === 'string' && cross.imageUrls[0].includes('X-Amz-Signature='),
    missingObjectUnchanged:
      typeof missing.imageUrls[0] === 'string' && missing.imageUrls[0].includes('X-Amz-Signature='),
    wrongOwnerAvatarUnchanged:
      typeof wife.avatarUrl === 'string' && wife.avatarUrl.includes('X-Amz-Signature='),
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`fixture assertion failed: ${JSON.stringify(assertions)}`);
  }
  console.log(JSON.stringify({ result: 'PASS', mode, assertions }));
}

await prisma.$disconnect();
