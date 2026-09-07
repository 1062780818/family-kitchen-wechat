import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WxClient } from './wx.client';
import type { WxLoginResponseDto } from './dto/wx-login.dto';
import type { AdminLoginResponseDto } from './dto/admin-login.dto';
import { hashPassword, verifyPassword } from './password.util';
import { isPasswordLoginEnabled, resolveAdminCredentials } from '../../config/access-flags';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly wx: WxClient,
  ) {}

  /** 小程序 wx.login → 内部 JWT */
  async wxLogin(code: string, gender?: string): Promise<WxLoginResponseDto> {
    const session = await this.wx.code2Session(code);

    const existing = await this.prisma.user.findUnique({
      where: { wxOpenid: session.openid },
    });

    let isNewUser = false;
    const user =
      existing ??
      (await (async () => {
        isNewUser = true;
        return this.prisma.user.create({
          data: {
            wxOpenid: session.openid,
            wxUnionid: session.unionid,
            nickname: '情侣厨房用户',
            gender: gender ?? 'male',
          },
        });
      })());

    const token = await this.signUserToken({
      userId: user.id,
      wxOpenid: user.wxOpenid ?? undefined,
    });

    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        gender: user.gender,
        currentFamilyId: user.currentFamilyId,
      },
      isNewUser,
    };
  }

  /**
   * H5 手机号 + 密码登录 / 注册。
   * - 手机号已存在：校验密码；若该用户尚未设置密码（如纯微信用户未绑定）则提示去小程序设置。
   * - 手机号不存在：创建新用户并设置密码（isNewUser=true）。
   * 返回结构与 wxLogin 一致，token / user DTO 跨端通用。
   */
  async passwordLogin(
    phone: string,
    password: string,
    gender?: string,
  ): Promise<WxLoginResponseDto> {
    if (!isPasswordLoginEnabled(this.config)) {
      throw new ForbiddenException({
        code: 'PASSWORD_LOGIN_DISABLED',
        message: '手机号密码登录未启用',
      });
    }
    const existing = await this.prisma.user.findUnique({ where: { phone } });

    let user = existing;
    let isNewUser = false;

    if (existing) {
      if (existing.deletedAt) {
        throw new UnauthorizedException({ code: 'USER_DELETED', message: '账号已注销' });
      }
      if (!existing.passwordHash) {
        throw new UnauthorizedException({
          code: 'PASSWORD_NOT_SET',
          message: '该手机号尚未设置登录密码，请在小程序「我的」中绑定后再登录',
        });
      }
      const ok = await verifyPassword(password, existing.passwordHash);
      if (!ok) {
        throw new UnauthorizedException({ code: 'BAD_CREDENTIALS', message: '手机号或密码错误' });
      }
    } else {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: {
          phone,
          passwordHash: await hashPassword(password),
          nickname: '情侣厨房用户',
          gender: gender ?? 'male',
        },
      });
    }

    const token = await this.signUserToken({ userId: user!.id });

    return {
      token,
      user: {
        id: user!.id,
        nickname: user!.nickname,
        avatarUrl: user!.avatarUrl,
        gender: user!.gender,
        currentFamilyId: user!.currentFamilyId,
      },
      isNewUser,
    };
  }

  /**
   * 后台管理员登录。
   * 可选管理入口：只有显式启用且凭据完整有效时才签发管理员 JWT。
   * 后期再换为 admin_user 表 + bcrypt。
   */
  async adminLogin(username: string, password: string): Promise<AdminLoginResponseDto> {
    const credentials = resolveAdminCredentials(this.config);
    if (!credentials) {
      throw new ForbiddenException({
        code: 'ADMIN_ACCESS_DISABLED',
        message: '管理入口未启用或配置无效',
      });
    }
    if (username !== credentials.username || password !== credentials.password) {
      throw new UnauthorizedException({
        code: 'BAD_CREDENTIALS',
        message: '账号或密码错误',
      });
    }
    const token = await this.jwt.signAsync(
      { sub: `admin:${username}`, isAdmin: true },
      { secret: this.config.get<string>('JWT_SECRET'), expiresIn: '12h' },
    );
    return { token, username };
  }

  async signUserToken(payload: { userId: string; wxOpenid?: string }): Promise<string> {
    return this.jwt.signAsync(
      { sub: payload.userId, openid: payload.wxOpenid },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '30d'),
      },
    );
  }
}
