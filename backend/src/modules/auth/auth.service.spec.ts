import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { WxClient } from './wx.client';
import { PrismaService } from '../../prisma/prisma.service';
import { hashPassword } from './password.util';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let wx: { code2Session: jest.Mock };
  let jwt: { signAsync: jest.Mock };
  let configValues: Record<string, string>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    wx = { code2Session: jest.fn() };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-jwt') };
    configValues = {
      NODE_ENV: 'test',
      PASSWORD_LOGIN_ENABLED: 'true',
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '30d',
      ADMIN_ENABLED: 'true',
      ADMIN_USERNAME: 'c01-admin',
      ADMIN_PASSWORD: 'C01-Isolated-Admin-Password',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: WxClient, useValue: wx },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => configValues[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = moduleRef.get<AuthService>(AuthService);
  });

  describe('wxLogin', () => {
    it('creates new user on first login and marks isNewUser=true', async () => {
      wx.code2Session.mockResolvedValue({ openid: 'wx_001', session_key: 'sk' });
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        wxOpenid: 'wx_001',
        nickname: '情侣厨房用户',
        avatarUrl: null,
        gender: 'male',
        currentFamilyId: null,
      });

      const result = await service.wxLogin('code-abc', 'male');

      expect(wx.code2Session).toHaveBeenCalledWith('code-abc');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ gender: 'male' }) }),
      );
      expect(result.token).toBe('signed-jwt');
      expect(result.isNewUser).toBe(true);
      expect(result.user.id).toBe('u1');
      expect(result.user.gender).toBe('male');
    });

    it('reuses existing user on subsequent login', async () => {
      wx.code2Session.mockResolvedValue({ openid: 'wx_002', session_key: 'sk' });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u2',
        wxOpenid: 'wx_002',
        nickname: '阿酒',
        avatarUrl: 'https://a.com/x.png',
        gender: 'female',
        currentFamilyId: 'fam1',
      });

      const result = await service.wxLogin('code-xyz');

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe('u2');
      expect(result.user.currentFamilyId).toBe('fam1');
    });
  });

  describe('passwordLogin', () => {
    it('rejects when the isolated password-login flag is disabled', async () => {
      configValues.PASSWORD_LOGIN_ENABLED = 'false';

      await expect(service.passwordLogin('13800138998', 'secret123')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects in production even if the isolated flag is set', async () => {
      configValues.NODE_ENV = 'production';

      await expect(service.passwordLogin('13800138999', 'secret123')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('registers a new user when phone is unused and marks isNewUser=true', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u3',
        phone: '13800138000',
        nickname: '情侣厨房用户',
        avatarUrl: null,
        gender: 'female',
        currentFamilyId: null,
      });

      const result = await service.passwordLogin('13800138000', 'secret123', 'female');

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: '13800138000', gender: 'female' }),
        }),
      );
      expect(result.isNewUser).toBe(true);
      expect(result.token).toBe('signed-jwt');
      expect(result.user.id).toBe('u3');
    });

    it('logs in an existing user with the correct password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u4',
        phone: '13800138001',
        passwordHash: await hashPassword('secret123'),
        nickname: '阿酒',
        avatarUrl: null,
        gender: 'female',
        currentFamilyId: 'fam1',
        deletedAt: null,
      });

      const result = await service.passwordLogin('13800138001', 'secret123');

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe('u4');
    });

    it('rejects a wrong password with BAD_CREDENTIALS', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u5',
        phone: '13800138002',
        passwordHash: await hashPassword('secret123'),
        deletedAt: null,
      });

      await expect(service.passwordLogin('13800138002', 'wrong-pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects login when the user has no password set (PASSWORD_NOT_SET)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u6',
        phone: '13800138003',
        passwordHash: null,
        deletedAt: null,
      });

      await expect(service.passwordLogin('13800138003', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('adminLogin', () => {
    it('returns token on correct credentials', async () => {
      const result = await service.adminLogin('c01-admin', 'C01-Isolated-Admin-Password');
      expect(result.token).toBe('signed-jwt');
      expect(result.username).toBe('c01-admin');
    });

    it('throws on bad credentials', async () => {
      await expect(service.adminLogin('c01-admin', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it.each([
      ['disabled', { ADMIN_ENABLED: 'false' }],
      ['missing', { ADMIN_ENABLED: 'true', ADMIN_USERNAME: undefined, ADMIN_PASSWORD: undefined }],
      ['empty', { ADMIN_ENABLED: 'true', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' }],
      [
        'partial',
        { ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'c01-admin', ADMIN_PASSWORD: undefined },
      ],
      [
        'legacy defaults',
        { ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin123456' },
      ],
    ])('rejects %s administrator configuration', async (_name, overrides) => {
      Object.assign(configValues, overrides);
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete configValues[key];
      }

      await expect(service.adminLogin('admin', 'admin123456')).rejects.toThrow(ForbiddenException);
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });
});
