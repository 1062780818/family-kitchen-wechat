import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService, MAX_UPLOAD_SIZE_BYTES } from './storage.service';
import { StorageCategory } from './dto/upload-result.dto';
import { PrismaService } from '../../prisma/prisma.service';

const mockMinioClient = {
  bucketExists: jest.fn().mockResolvedValue(true),
  makeBucket: jest.fn(),
  setBucketPolicy: jest.fn(),
  statObject: jest.fn().mockResolvedValue({}),
  putObject: jest.fn().mockResolvedValue(undefined),
  removeObject: jest.fn().mockResolvedValue(undefined),
  presignedGetObject: jest.fn().mockResolvedValue('signed://x'),
};

// mock minio client：只验证调用，不真连
jest.mock('minio', () => {
  return {
    Client: jest.fn().mockImplementation(() => mockMinioClient),
  };
});

function buildConfig(overrides: Record<string, string> = {}): ConfigService {
  const map: Record<string, string> = {
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_BUCKET: 'family-kitchen',
    MINIO_PUBLIC_BASE_URL: 'http://localhost:9000/family-kitchen',
    ...overrides,
  };
  return {
    get: <T>(key: string, fallback?: T) => (map[key] as unknown as T) ?? fallback,
  } as unknown as ConfigService;
}

describe('StorageService', () => {
  let service: StorageService;
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ currentFamilyId: where.id === 'outsider' ? 'family-2' : 'family-1' }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    familyMember: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
    recipe: { findFirst: jest.fn().mockResolvedValue(null) },
    order: { findFirst: jest.fn().mockResolvedValue(null) },
    orderItem: { findFirst: jest.fn().mockResolvedValue(null) },
    timelineEntry: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: buildConfig() },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get<StorageService>(StorageService);
  });

  describe('uploadFile', () => {
    it('rejects non-image mime types', async () => {
      await expect(
        service.uploadFile({
          buffer: Buffer.from([0]),
          mimeType: 'application/pdf',
          category: StorageCategory.RECIPE,
          userId: 'u1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects files over 10MB', async () => {
      const tooBig = Buffer.alloc(MAX_UPLOAD_SIZE_BYTES + 1);
      await expect(
        service.uploadFile({
          buffer: tooBig,
          mimeType: 'image/jpeg',
          category: StorageCategory.RECIPE,
          userId: 'u1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('generates key with category prefix + date + user-random.ext', async () => {
      const result = await service.uploadFile({
        buffer: Buffer.from('fake'),
        mimeType: 'image/jpeg',
        category: StorageCategory.RECIPE,
        userId: 'u-abc',
      });
      expect(result.key).toMatch(
        /^family\/family-1\/recipe\/\d{4}-\d{2}-\d{2}\/u-abc-[a-zA-Z0-9]{16}\.jpg$/,
      );
      expect(result.url).toBe('signed://x');
      expect(result.size).toBe(4);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it.each([
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['image/gif', 'gif'],
    ])('maps %s to .%s', async (mime, expectedExt) => {
      const result = await service.uploadFile({
        buffer: Buffer.from('x'),
        mimeType: mime,
        category: StorageCategory.AVATAR,
        userId: 'u1',
      });
      expect(result.key.endsWith(`.${expectedExt}`)).toBe(true);
    });

    it('rejects a non-creator uploading a formal recipe image', async () => {
      prisma.familyMember.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.uploadFile({
          buffer: Buffer.from('fake'),
          mimeType: 'image/jpeg',
          category: StorageCategory.RECIPE,
          userId: 'u-wife',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMinioClient.putObject).not.toHaveBeenCalled();
    });
  });

  describe('publicUrl', () => {
    it('only exposes system assets anonymously', () => {
      expect(service.publicUrl('system/avatar.jpg')).toBe(
        'http://localhost:9000/family-kitchen/system/avatar.jpg',
      );
      expect(() => service.publicUrl('family/family-1/recipe/x.jpg')).toThrow(BadRequestException);
    });
  });

  describe('family access boundary', () => {
    const ownKey = 'family/family-1/recipe/2026-09-07/u1-abcdefghijklmnop.jpg';
    const peerKey = 'family/family-1/recipe/2026-09-07/u2-abcdefghijklmnop.jpg';

    it('allows an active family member to request a signed URL', async () => {
      await expect(service.getFamilyFileUrl('u1', peerKey)).resolves.toBe('signed://x');
    });

    it('rejects cross-family and tampered keys before object access', async () => {
      await expect(service.getFamilyFileUrl('outsider', ownKey)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getFamilyFileUrl('u1', '../system/avatar.jpg')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows only the uploader to delete a family object', async () => {
      await expect(service.deleteFamilyFile('u1', ownKey)).resolves.toBeUndefined();
      await expect(service.deleteFamilyFile('u1', peerKey)).rejects.toThrow(ForbiddenException);
      expect(mockMinioClient.removeObject).toHaveBeenCalledTimes(1);
    });

    it('does not delete an object that is still referenced by a recipe', async () => {
      prisma.recipe.findFirst.mockResolvedValueOnce({ id: 'recipe-1' });
      await expect(service.deleteFamilyFile('u1', ownKey)).rejects.toThrow(ConflictException);
      expect(mockMinioClient.removeObject).not.toHaveBeenCalled();
    });

    it('limits the anonymous bucket policy to system assets', async () => {
      await service.onModuleInit();
      const policy = JSON.parse(mockMinioClient.setBucketPolicy.mock.calls[0][1]);
      expect(policy.Statement[0].Resource).toEqual(['arn:aws:s3:::family-kitchen/system/*']);
    });

    it('rejects signed URLs and category substitution in persistent fields', async () => {
      await expect(
        service.validateFamilyObjectKeys(
          'u1',
          ['https://minio.test/x?X-Amz-Signature=fake'],
          StorageCategory.RECIPE,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.validateFamilyObjectKeys('u1', [peerKey], StorageCategory.AVATAR),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an existing stable key in the expected category', async () => {
      await expect(
        service.validateFamilyObjectKeys('u1', [ownKey], StorageCategory.RECIPE),
      ).resolves.toBeUndefined();
      expect(mockMinioClient.statObject).toHaveBeenCalledWith('family-kitchen', ownKey);
    });
  });

  it('supports a short test TTL but caps configured values at 15 minutes', async () => {
    const shortModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: buildConfig({ MINIO_SIGNED_URL_TTL_SECONDS: '2' }),
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    expect(shortModule.get(StorageService).getSignedUrlTtlSeconds()).toBe(2);

    const cappedModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: buildConfig({ MINIO_SIGNED_URL_TTL_SECONDS: '999999' }),
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    expect(cappedModule.get(StorageService).getSignedUrlTtlSeconds()).toBe(900);
  });
});
