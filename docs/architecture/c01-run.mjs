// Codex-01 第0阶段命令记录器：不改业务代码，不代替独立验收。
// 用法：C01_PNPM_CLI 指向 pnpm 9.12.0 的 bin/pnpm.cjs。
// node docs/architecture/c01-run.mjs <日志名> <超时秒数> <pnpm参数...>
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const [label, seconds, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label ?? '') || !process.env.C01_PNPM_CLI || !args.length) {
  throw new Error('请设置 C01_PNPM_CLI，并提供日志名、超时秒数及 pnpm 参数');
}
const cwd = process.cwd();
const dir = resolve(cwd, 'docs/audit-logs');
mkdirSync(dir, { recursive: true });
const log = createWriteStream(resolve(dir, `${label}.log`));
const started = new Date();
const databaseName = process.env.C01_DATABASE_NAME ?? 'c01_baseline_audit';
if (!/^c01_[a-z0-9_]+$/.test(databaseName)) throw new Error('仅允许本机 c01_ 前缀审查数据库');
const env = {
  ...process.env,
  CI: 'true',
  NO_COLOR: '1',
  // 仅本机审查占位配置，不使用真实用户、微信或线上数据库。
  DATABASE_URL: `mysql://c01_audit:local_placeholder@127.0.0.1:33316/${databaseName}`,
  JWT_SECRET: 'c01-local-audit-placeholder-not-for-production',
  WX_APPID: 'c01-placeholder',
  WX_APP_SECRET: 'c01-placeholder',
  PORT: '33300',
  WS_PORT: '33301',
  MINIO_ENDPOINT: '127.0.0.1',
  MINIO_PORT: '33319',
  MINIO_ACCESS_KEY: 'c01minio',
  MINIO_SECRET_KEY: 'c01-local-minio-placeholder',
  SENTRY_DSN: '',
  NODE_ENV: 'development',
};
// 防止宿主 pnpm 11 fallback 被根脚本里的嵌套 pnpm 命令调用。
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
env[pathKey] =
  resolve(cwd, 'docs/architecture/bin') + (process.platform === 'win32' ? ';' : ':') + env[pathKey];
const metadata = {
  label,
  cwd,
  node: process.version,
  pnpmCli: env.C01_PNPM_CLI,
  args,
  started: started.toISOString(),
  timeoutSeconds: Number(seconds),
  sourceChanged: false,
  databaseName,
  localServicePorts: [33300, 33301, 33316, 33319],
};
log.write(JSON.stringify(metadata) + '\n');
let tail = '';
let timedOut = false;
const child = spawn(process.execPath, [env.C01_PNPM_CLI, ...args], { cwd, env, windowsHide: true });
metadata.pid = child.pid;
writeFileSync(resolve(dir, `${label}.started.json`), JSON.stringify(metadata, null, 2));
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => {
    log.write(chunk);
    tail = (tail + chunk.toString()).slice(-6000);
  });
child.on('error', (err) => {
  log.write(String(err));
});
const timer = setTimeout(
  () => {
    timedOut = true;
    // 仅终止本记录器创建的子进程树，不按进程名称批量停止。
    if (process.platform === 'win32')
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    else child.kill('SIGTERM');
  },
  Number(seconds) * 1000,
);
child.on('close', (code, signal) => {
  clearTimeout(timer);
  const result = { ...metadata, code, signal, timedOut, seconds: (Date.now() - started) / 1000 };
  log.end('\n' + JSON.stringify(result) + '\n');
  writeFileSync(resolve(dir, `${label}.json`), JSON.stringify(result, null, 2));
  console.log(tail);
  console.log(JSON.stringify(result));
  process.exitCode = timedOut ? 124 : (code ?? 1);
});
