// 第0阶段静态证据采集；读取原文件，生成审查清单，不修改业务代码。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = process.cwd();
const out = path.join(root, 'docs/audit-logs');
fs.mkdirSync(out, { recursive: true });
const packages = new Map();
function inspect(dir) {
  try {
    const real = fs.realpathSync(dir);
    if (packages.has(real)) return;
    const p = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8'));
    const licenses = fs
      .readdirSync(real)
      .filter((n) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(n))
      .filter((n) => fs.statSync(path.join(real, n)).isFile())
      .map((n) => {
        const content = fs.readFileSync(path.join(real, n));
        return {
          file: path.relative(root, path.join(real, n)),
          sha256: crypto.createHash('sha256').update(content).digest('hex'),
          copyright: content
            .toString('utf8')
            .split(/\r?\n/)
            .filter((l) => /copyright/i.test(l))
            .slice(0, 20),
        };
      });
    packages.set(real, {
      name: p.name,
      version: p.version,
      license: p.license ?? p.licenses ?? 'UNKNOWN',
      licenses,
      repository: p.repository,
      deprecated: p.deprecated,
    });
  } catch {}
}
for (const entry of fs.readdirSync('node_modules/.pnpm', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const nm = path.join('node_modules/.pnpm', entry.name, 'node_modules');
  if (!fs.existsSync(nm)) continue;
  for (const e of fs.readdirSync(nm)) {
    if (e.startsWith('@')) {
      for (const sub of fs.readdirSync(path.join(nm, e))) inspect(path.join(nm, e, sub));
    } else inspect(path.join(nm, e));
  }
}
const all = [...packages.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);
const direct = [];
for (const workspace of ['.', 'backend', 'admin', 'mini-app', 'packages/shared']) {
  const p = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
  for (const [name, range] of Object.entries({ ...p.dependencies, ...p.devDependencies })) {
    if (range.startsWith('workspace:')) continue;
    try {
      const installed = JSON.parse(
        fs.readFileSync(path.join(workspace, 'node_modules', name, 'package.json'), 'utf8'),
      );
      direct.push({
        workspace,
        name,
        range,
        version: installed.version,
        license: installed.license ?? 'UNKNOWN',
      });
    } catch {
      direct.push({ workspace, name, range, error: 'NOT_INSTALLED' });
    }
  }
}
const counts = {};
for (const p of all) {
  const k = typeof p.license === 'string' ? p.license : JSON.stringify(p.license);
  counts[k] = (counts[k] ?? 0) + 1;
}
const result = {
  generated: new Date().toISOString(),
  scope: '本机已安装依赖；不含未安装平台可选包和外部服务；元数据不等于完整法律验收',
  packageCount: all.length,
  licenseCounts: counts,
  direct,
  packages: all,
};
fs.writeFileSync(path.join(out, '38-license-inventory.json'), JSON.stringify(result, null, 2));
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
}
for (const dir of ['backend/src', 'mini-app/src', 'admin/src', 'packages/shared/src']) walk(dir);
const controllers = files
  .filter((f) => f.endsWith('.controller.ts'))
  .map((file) => ({
    file,
    lines: fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .flatMap((line, i) =>
        /@Controller|@(Get|Post|Patch|Put|Delete)\(/.test(line)
          ? [{ line: i + 1, text: line.trim() }]
          : [],
      ),
  }));
const schema = fs.readFileSync('backend/prisma/schema.prisma', 'utf8');
const inv = {
  generated: result.generated,
  miniPages: JSON.parse(fs.readFileSync('mini-app/src/pages.json', 'utf8')).pages.map(
    (p) => p.path,
  ),
  controllers,
  models: [...schema.matchAll(/^model (\w+) /gm)].map((m) => m[1]),
  testFiles: files.filter((f) => /\.(spec|test)\./.test(f)),
  sourceFileCount: files.length,
};
fs.writeFileSync(path.join(out, '39-source-inventory.json'), JSON.stringify(inv, null, 2));
console.log(
  JSON.stringify(
    {
      packageCount: all.length,
      licenseCounts: counts,
      direct,
      sourceFileCount: files.length,
      pageCount: inv.miniPages.length,
      controllerCount: controllers.length,
      modelCount: inv.models.length,
    },
    null,
    2,
  ),
);
