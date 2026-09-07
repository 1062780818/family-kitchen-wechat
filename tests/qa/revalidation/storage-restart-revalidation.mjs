import { createRequire } from 'node:module';

const requireFromBackend = createRequire(new URL('../../../backend/package.json', import.meta.url));
const { PrismaClient } = requireFromBackend('@prisma/client');

const api = process.env.C03_API_BASE;
const password = process.env.C03_TEST_PASSWORD;
if (!api || !password || !process.env.DATABASE_URL) {
  throw new Error('C03_API_BASE, C03_TEST_PASSWORD and DATABASE_URL are required');
}

const prisma = new PrismaClient();
const response = await fetch(`${api}/auth/password-login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: '13900006432', password, gender: 'female' }),
});
const auth = await response.json();
if (!response.ok) throw new Error(`login failed: ${response.status} ${JSON.stringify(auth)}`);

const recipe = await prisma.recipe.findFirstOrThrow({
  where: { familyId: auth.user.currentFamilyId, name: { startsWith: 'C03-004图片菜-' } },
  orderBy: { createdAt: 'desc' },
});
const key = recipe.imageUrls?.[0];
if (typeof key !== 'string' || !/^family\/[^/]+\/recipe\//.test(key)) {
  throw new Error(`database reference is not a stable recipe key: ${JSON.stringify(recipe.imageUrls)}`);
}
const urlResponse = await fetch(`${api}/storage/url?key=${encodeURIComponent(key)}`, {
  headers: { authorization: `Bearer ${auth.token}` },
});
const urlBody = await urlResponse.json();
if (!urlResponse.ok || typeof urlBody.url !== 'string') {
  throw new Error(`fresh URL failed: ${urlResponse.status} ${JSON.stringify(urlBody)}`);
}
const objectResponse = await fetch(urlBody.url);
if (!objectResponse.ok) throw new Error(`real object read failed: ${objectResponse.status}`);

console.log(
  JSON.stringify({
    result: 'PASS',
    persistedReference: key,
    freshUrlStatus: urlResponse.status,
    objectStatus: objectResponse.status,
  }),
);
await prisma.$disconnect();
