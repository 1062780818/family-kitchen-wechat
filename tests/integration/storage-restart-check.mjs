const apiBase = process.env.C01_API_BASE ?? 'http://127.0.0.1:33500/api/v1';
const password = process.env.C01_TEST_PASSWORD;

if (!password) throw new Error('C01_TEST_PASSWORD is required');

const response = await fetch(`${apiBase}/auth/password-login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ phone: '13900006002', password, gender: 'female' }),
});
const auth = await response.json();
if (!response.ok) throw new Error(`login failed: ${response.status} ${JSON.stringify(auth)}`);

const recipesResponse = await fetch(`${apiBase}/recipes`, {
  headers: { authorization: `Bearer ${auth.token}` },
});
const recipesBody = await recipesResponse.json();
const recipes = Array.isArray(recipesBody) ? recipesBody : recipesBody.items;
if (!Array.isArray(recipes)) {
  throw new Error(`recipe list failed: ${recipesResponse.status} ${JSON.stringify(recipesBody)}`);
}
const recipe = recipes.find((item) => item.name === 'C01并发测试菜');
if (!recipe) throw new Error('persisted recipe was not found after service restart');
const key = recipe.imageUrls?.[0];
if (typeof key !== 'string' || !/^family\/[^/]+\/recipe\//.test(key)) {
  throw new Error(`recipe did not retain a stable family object key: ${JSON.stringify(recipe.imageUrls)}`);
}

const urlResponse = await fetch(`${apiBase}/storage/url?key=${encodeURIComponent(key)}`, {
  headers: { authorization: `Bearer ${auth.token}` },
});
const urlBody = await urlResponse.json();
if (!urlResponse.ok || typeof urlBody.url !== 'string') {
  throw new Error(`fresh signed URL failed after restart: ${urlResponse.status} ${JSON.stringify(urlBody)}`);
}
const objectResponse = await fetch(urlBody.url);
if (!objectResponse.ok) throw new Error(`fresh object URL failed: ${objectResponse.status}`);

console.log(JSON.stringify({
  result: 'PASS',
  persistedReference: key,
  freshUrlStatus: urlResponse.status,
  objectStatus: objectResponse.status,
}));
