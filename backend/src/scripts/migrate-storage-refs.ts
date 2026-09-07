import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { Client as MinioClient } from 'minio';
import { PrismaClient, type Prisma } from '@prisma/client';
import { config as loadEnvFile } from 'dotenv';

type Change = {
  model: 'recipe' | 'order' | 'orderItem' | 'timelineEntry' | 'user';
  id: string;
  field: string;
  before: unknown;
  after: unknown;
};

type Backup = { version: 1; createdAt: string; changes: Change[] };

type Mode = 'preview' | 'apply' | 'rollback';

function parseCliArguments(args: string[]): {
  mode: Mode;
  backupPath?: string;
  envFilePath?: string;
} {
  const [modeArg, ...options] = args;
  if (!['preview', 'apply', 'rollback'].includes(modeArg ?? '')) {
    throw new Error(
      'usage: migrate-storage-refs <preview|apply|rollback> [--env-file=<absolute-path>] [--backup=<absolute-path>]',
    );
  }
  if (options.includes('--')) {
    throw new Error(
      'literal -- is not accepted; pass named options directly after the script name',
    );
  }
  const parsed = new Map<string, string>();
  for (const option of options) {
    const match = option.match(/^--(env-file|backup)=(.+)$/);
    if (!match) throw new Error(`unknown or malformed argument: ${option}`);
    if (parsed.has(match[1])) throw new Error(`duplicate argument: --${match[1]}`);
    parsed.set(match[1], match[2]);
  }
  const backupPath = parsed.get('backup');
  const envFilePath = parsed.get('env-file');
  for (const [name, value] of [
    ['backup', backupPath],
    ['env-file', envFilePath],
  ] as const) {
    if (value && !isAbsolute(value)) throw new Error(`--${name} must be an absolute path`);
  }
  if (modeArg === 'preview' && backupPath) throw new Error('preview does not accept --backup');
  if (modeArg !== 'preview' && !backupPath) {
    throw new Error(`${modeArg} requires --backup=<absolute-path>`);
  }
  return { mode: modeArg as Mode, backupPath, envFilePath };
}

const { mode, backupPath, envFilePath } = parseCliArguments(process.argv.slice(2));
if (envFilePath) {
  const loaded = loadEnvFile({ path: envFilePath, override: false });
  if (loaded.error) throw new Error(`failed to load --env-file: ${loaded.error.message}`);
}

const prisma = new PrismaClient();
const bucket = process.env.MINIO_BUCKET ?? 'family-kitchen';
const publicBase = new URL(
  process.env.MINIO_PUBLIC_BASE_URL ??
    `http://${process.env.MINIO_ENDPOINT ?? 'localhost'}:${process.env.MINIO_PORT ?? '9000'}/${bucket}`,
);
const minio = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
  port: Number(process.env.MINIO_PORT ?? '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
});

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseTrustedSignedUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !/[?&]X-Amz-Signature=/i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== publicBase.origin) return null;
  const baseSegments = publicBase.pathname.split('/').filter(Boolean);
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!baseSegments.every((segment, index) => segments[index] === segment)) return null;
  const objectSegments = segments.slice(baseSegments.length);
  if (objectSegments[0] === bucket) objectSegments.shift();
  const key = objectSegments.join('/');
  return key.startsWith('family/') ? key : null;
}

function keyParts(key: string): {
  familyId: string;
  category: string;
  ownerUserId: string;
} | null {
  const parts = key.split('/');
  if (parts.length !== 5 || parts[0] !== 'family') return null;
  const [, familyId, category, date, filename] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = filename.match(/^(.+)-[A-Za-z0-9]{16}\.(jpg|png|webp|gif)$/);
  return match?.[1] ? { familyId, category, ownerUserId: match[1] } : null;
}

async function convertRefs(
  value: unknown,
  familyId: string,
  expectedCategory: string,
  ownerUserId?: string,
): Promise<unknown> {
  if (!Array.isArray(value)) return value;
  const output: unknown[] = [];
  for (const ref of value) {
    const key = parseTrustedSignedUrl(ref);
    if (!key) {
      output.push(ref);
      continue;
    }
    const parsed = keyParts(key);
    if (
      !parsed ||
      parsed.familyId !== familyId ||
      parsed.category !== expectedCategory ||
      (ownerUserId && parsed.ownerUserId !== ownerUserId)
    ) {
      output.push(ref);
      continue;
    }
    try {
      await minio.statObject(bucket, key);
      output.push(key);
    } catch {
      output.push(ref);
    }
  }
  return output;
}

async function inspect(): Promise<Change[]> {
  const changes: Change[] = [];
  const [recipes, orders, timeline, users] = await Promise.all([
    prisma.recipe.findMany({ select: { id: true, familyId: true, imageUrls: true } }),
    prisma.order.findMany({
      select: {
        id: true,
        familyId: true,
        servedImageUrls: true,
        items: { select: { id: true, recipeSnapshot: true } },
      },
    }),
    prisma.timelineEntry.findMany({ select: { id: true, familyId: true, imageUrls: true } }),
    prisma.user.findMany({
      select: { id: true, currentFamilyId: true, avatarUrl: true },
    }),
  ]);

  for (const row of recipes) {
    const after = await convertRefs(row.imageUrls, row.familyId, 'recipe');
    if (!sameValue(row.imageUrls, after))
      changes.push({
        model: 'recipe',
        id: row.id,
        field: 'imageUrls',
        before: row.imageUrls,
        after,
      });
  }
  for (const row of orders) {
    const after = await convertRefs(row.servedImageUrls, row.familyId, 'order-served');
    if (!sameValue(row.servedImageUrls, after))
      changes.push({
        model: 'order',
        id: row.id,
        field: 'servedImageUrls',
        before: row.servedImageUrls,
        after,
      });
    for (const item of row.items) {
      const snapshot = item.recipeSnapshot as Record<string, unknown> | null;
      if (!snapshot || !Array.isArray(snapshot.imageUrls)) continue;
      const imageUrls = await convertRefs(snapshot.imageUrls, row.familyId, 'recipe');
      const updated = { ...snapshot, imageUrls };
      if (!sameValue(snapshot, updated))
        changes.push({
          model: 'orderItem',
          id: item.id,
          field: 'recipeSnapshot',
          before: snapshot,
          after: updated,
        });
    }
  }
  for (const row of timeline) {
    const after = await convertRefs(row.imageUrls, row.familyId, 'timeline');
    if (!sameValue(row.imageUrls, after))
      changes.push({
        model: 'timelineEntry',
        id: row.id,
        field: 'imageUrls',
        before: row.imageUrls,
        after,
      });
  }
  for (const row of users) {
    if (!row.currentFamilyId || !row.avatarUrl) continue;
    const converted = await convertRefs([row.avatarUrl], row.currentFamilyId, 'avatar', row.id);
    const after = Array.isArray(converted) ? converted[0] : row.avatarUrl;
    if (!sameValue(row.avatarUrl, after))
      changes.push({ model: 'user', id: row.id, field: 'avatarUrl', before: row.avatarUrl, after });
  }
  return changes;
}

async function writeChange(
  tx: Prisma.TransactionClient,
  change: Change,
  value: unknown,
): Promise<void> {
  const data = { [change.field]: value };
  if (change.model === 'recipe') await tx.recipe.update({ where: { id: change.id }, data });
  else if (change.model === 'order') await tx.order.update({ where: { id: change.id }, data });
  else if (change.model === 'orderItem')
    await tx.orderItem.update({
      where: { id: change.id },
      data: data as Prisma.OrderItemUpdateInput,
    });
  else if (change.model === 'timelineEntry')
    await tx.timelineEntry.update({ where: { id: change.id }, data });
  else await tx.user.update({ where: { id: change.id }, data: data as Prisma.UserUpdateInput });
}

async function readCurrent(tx: Prisma.TransactionClient, change: Change): Promise<unknown> {
  if (change.model === 'recipe')
    return (
      await tx.recipe.findUniqueOrThrow({ where: { id: change.id }, select: { imageUrls: true } })
    ).imageUrls;
  if (change.model === 'order')
    return (
      await tx.order.findUniqueOrThrow({
        where: { id: change.id },
        select: { servedImageUrls: true },
      })
    ).servedImageUrls;
  if (change.model === 'orderItem')
    return (
      await tx.orderItem.findUniqueOrThrow({
        where: { id: change.id },
        select: { recipeSnapshot: true },
      })
    ).recipeSnapshot;
  if (change.model === 'timelineEntry')
    return (
      await tx.timelineEntry.findUniqueOrThrow({
        where: { id: change.id },
        select: { imageUrls: true },
      })
    ).imageUrls;
  return (
    await tx.user.findUniqueOrThrow({ where: { id: change.id }, select: { avatarUrl: true } })
  ).avatarUrl;
}

async function main(): Promise<void> {
  if (mode === 'rollback') {
    const backup = JSON.parse(readFileSync(backupPath!, 'utf8')) as Backup;
    if (backup.version !== 1) throw new Error('unsupported backup version');
    await prisma.$transaction(async (tx) => {
      for (const change of [...backup.changes].reverse()) {
        const current = await readCurrent(tx, change);
        if (!sameValue(current, change.after)) {
          throw new Error(`rollback refused: ${change.model}/${change.id} changed after migration`);
        }
        await writeChange(tx, change, change.before);
      }
    });
    console.log(JSON.stringify({ mode, backupPath, restored: backup.changes.length }));
    return;
  }

  const changes = await inspect();
  console.log(JSON.stringify({ mode, backupPath, convertible: changes.length, changes }, null, 2));
  if (mode === 'apply') {
    if (existsSync(backupPath!)) throw new Error(`backup already exists: ${backupPath}`);
    accessSync(dirname(backupPath!), constants.W_OK);
    const backup: Backup = { version: 1, createdAt: new Date().toISOString(), changes };
    const descriptor = openSync(backupPath!, 'wx', 0o600);
    try {
      writeFileSync(descriptor, `${JSON.stringify(backup, null, 2)}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        const current = await readCurrent(tx, change);
        if (!sameValue(current, change.before)) {
          throw new Error(`apply refused: ${change.model}/${change.id} changed after preview`);
        }
        await writeChange(tx, change, change.after);
      }
    });
    console.log(JSON.stringify({ mode, backupPath, applied: changes.length }));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
