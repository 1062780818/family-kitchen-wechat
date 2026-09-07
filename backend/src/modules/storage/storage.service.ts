import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { randomBytes } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { StorageCategory, UploadResultDto } from './dto/upload-result.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { requireFamilyId } from '../../common/family-context';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const FAMILY_FILE_URL_TTL_SECONDS = 15 * 60;

function customAlphabet(alphabet: string, size: number): () => string {
  return () => {
    const bytes = randomBytes(size);
    let result = '';
    for (let i = 0; i < size; i++) {
      result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
  };
}

const generateKey = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  16,
);

/** 抽象接口 —— 切换到 COS/OSS 时只换 implementation */
export interface ObjectStorage {
  upload(buffer: Buffer, key: string, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn: number): Promise<string>;
  publicUrl(key: string): string;
}

@Injectable()
export class StorageService implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private defaultAvatarMaleUrl = '';
  private defaultAvatarFemaleUrl = '';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'family-kitchen');
    this.publicBaseUrl =
      config.get<string>('MINIO_PUBLIC_BASE_URL') ??
      `http://${config.get<string>('MINIO_ENDPOINT', 'localhost')}:${config.get<string>('MINIO_PORT', '9000')}/${this.bucket}`;
    this.client = new MinioClient({
      endPoint: config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(config.get<string>('MINIO_PORT', '9000')),
      useSSL: config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`MinIO bucket "${this.bucket}" created`);
      }
      // 仅系统默认素材允许匿名读取；家庭图片一律通过鉴权后的签名 URL 读取。
      const publicReadPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/system/*`],
          },
        ],
      };
      await this.client.setBucketPolicy(this.bucket, JSON.stringify(publicReadPolicy));

      // seed 默认头像到对象存储（首次启动时）
      for (const { key, file, mime } of [
        {
          key: 'system/default-avatar-male.jpg',
          file: 'default-avatar-male.jpg',
          mime: 'image/jpeg',
        },
        {
          key: 'system/default-avatar-female.jpg',
          file: 'default-avatar-female.jpg',
          mime: 'image/jpeg',
        },
      ]) {
        const seeded = await this.client
          .statObject(this.bucket, key)
          .then(() => true)
          .catch(() => false);
        if (!seeded) {
          const filePath = join(process.cwd(), 'seed-assets', file);
          if (existsSync(filePath)) {
            const buf = readFileSync(filePath);
            await this.client.putObject(this.bucket, key, buf, buf.length, {
              'Content-Type': mime,
            });
            this.logger.log(`seeded ${key} to object storage`);
          }
        }
      }
      this.defaultAvatarMaleUrl = this.publicUrl('system/default-avatar-male.jpg');
      this.defaultAvatarFemaleUrl = this.publicUrl('system/default-avatar-female.jpg');
    } catch (err) {
      this.logger.warn(
        `MinIO 初始化失败（仅 storage 不可用，其他功能不受影响）: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ============================================================
  // ObjectStorage 接口实现
  // ============================================================

  async upload(buffer: Buffer, key: string, mimeType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expiresIn);
  }

  publicUrl(key: string): string {
    if (!key.startsWith('system/')) {
      throw new BadRequestException({
        code: 'PRIVATE_OBJECT_REQUIRES_SIGNED_URL',
        message: '家庭图片必须使用签名 URL',
      });
    }
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  getDefaultAvatarUrls(): { male: string; female: string } {
    return { male: this.defaultAvatarMaleUrl, female: this.defaultAvatarFemaleUrl };
  }

  // ============================================================
  // 业务包装：从 Controller 接收 buffer + meta 后调用
  // ============================================================

  async uploadFile(input: {
    buffer: Buffer;
    mimeType: string;
    originalFilename?: string;
    category: StorageCategory;
    userId: string;
  }): Promise<UploadResultDto> {
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_MIME',
        message: `仅支持图片（${ALLOWED_MIME_TYPES.join(', ')}）`,
      });
    }
    if (input.buffer.length > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `文件大小超过 ${MAX_UPLOAD_SIZE_BYTES / 1024 / 1024} MB`,
      });
    }

    const familyId = await requireFamilyId(this.prisma, input.userId);
    if (input.category === StorageCategory.RECIPE) {
      await this.requireMenuEditor(input.userId, familyId);
    }
    const ext = MIME_EXTENSION[input.mimeType] ?? 'bin';
    const today = new Date().toISOString().slice(0, 10);
    const key = `family/${familyId}/${input.category}/${today}/${input.userId}-${generateKey()}.${ext}`;

    await this.upload(input.buffer, key, input.mimeType);

    return {
      url: await this.getSignedUrl(key, FAMILY_FILE_URL_TTL_SECONDS),
      key,
      size: input.buffer.length,
      mimeType: input.mimeType,
    };
  }

  async getFamilyFileUrl(userId: string, key: string): Promise<string> {
    await this.assertFamilyObjectAccess(userId, key, false);
    return this.getSignedUrl(key, FAMILY_FILE_URL_TTL_SECONDS);
  }

  async deleteFamilyFile(userId: string, key: string): Promise<void> {
    await this.assertFamilyObjectAccess(userId, key, true);
    await this.delete(key);
  }

  private async assertFamilyObjectAccess(
    userId: string,
    key: string,
    ownerOnly: boolean,
  ): Promise<void> {
    const parsed = parseFamilyObjectKey(key);
    const familyId = await requireFamilyId(this.prisma, userId);
    if (parsed.familyId !== familyId) {
      throw new ForbiddenException({
        code: 'STORAGE_CROSS_FAMILY_FORBIDDEN',
        message: '不能访问其他家庭的图片',
      });
    }
    if (ownerOnly && parsed.ownerUserId !== userId) {
      throw new ForbiddenException({
        code: 'STORAGE_DELETE_FORBIDDEN',
        message: '只能删除自己上传的图片',
      });
    }
  }

  private async requireMenuEditor(userId: string, familyId: string): Promise<void> {
    const membership = await this.prisma.familyMember.findFirst({
      where: { familyId, userId, leftAt: null, role: 'creator' },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'MENU_EDITOR_ROLE_REQUIRED',
        message: '只有家庭创建者（丈夫）可以管理正式菜品图片',
      });
    }
  }
}

function parseFamilyObjectKey(key: string): { familyId: string; ownerUserId: string } {
  if (key.includes('..') || key.includes('\\') || key.startsWith('/')) {
    throw invalidObjectKey();
  }
  const parts = key.split('/');
  if (parts.length !== 5 || parts[0] !== 'family') throw invalidObjectKey();
  const [, familyId, category, date, filename] = parts;
  if (!familyId || !Object.values(StorageCategory).includes(category as StorageCategory)) {
    throw invalidObjectKey();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalidObjectKey();
  const match = filename.match(/^(.+)-[A-Za-z0-9]{16}\.(jpg|png|webp|gif)$/);
  if (!match?.[1]) throw invalidObjectKey();
  return { familyId, ownerUserId: match[1] };
}

function invalidObjectKey(): BadRequestException {
  return new BadRequestException({
    code: 'INVALID_STORAGE_KEY',
    message: '无效的图片资源标识',
  });
}
