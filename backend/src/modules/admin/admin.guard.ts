import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../../common/current-user.decorator';
import { resolveAdminCredentials } from '../../config/access-flags';

/**
 * 管理员守卫：要求 JWT 解析出的上下文 isAdmin=true。
 * 必须在 JwtAuthGuard 之后执行（实际由 NestJS 守卫栈保证：APP_GUARD 先跑）。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const credentials = resolveAdminCredentials(this.config);
    if (!credentials) {
      throw new ForbiddenException({
        code: 'ADMIN_ACCESS_DISABLED',
        message: '管理入口未启用或配置无效',
      });
    }
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user?.isAdmin || request.user.userId !== `admin:${credentials.username}`) {
      throw new ForbiddenException({
        code: 'ADMIN_FORBIDDEN',
        message: '此接口仅管理员可访问',
      });
    }
    return true;
  }
}
