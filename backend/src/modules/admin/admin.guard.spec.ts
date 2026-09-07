import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';

function buildCtx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  let values: Record<string, string>;
  let guard: AdminGuard;

  beforeEach(() => {
    values = {
      ADMIN_ENABLED: 'true',
      ADMIN_USERNAME: 'c01-admin',
      ADMIN_PASSWORD: 'C01-Isolated-Admin-Password',
    };
    const config = { get: (key: string) => values[key] } as ConfigService;
    guard = new AdminGuard(config);
  });

  it('rejects even an administrator token when the management entry is disabled', () => {
    values.ADMIN_ENABLED = 'false';
    expect(() => guard.canActivate(buildCtx({ userId: 'admin:old', isAdmin: true }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when no user on request', () => {
    expect(() => guard.canActivate(buildCtx(undefined))).toThrow(ForbiddenException);
  });

  it('rejects normal user', () => {
    expect(() => guard.canActivate(buildCtx({ userId: 'u1', isAdmin: false }))).toThrow(
      ForbiddenException,
    );
  });

  it('passes admin user', () => {
    expect(guard.canActivate(buildCtx({ userId: 'admin:c01-admin', isAdmin: true }))).toBe(true);
  });

  it('rejects a previously issued administrator token for another identity', () => {
    expect(() => guard.canActivate(buildCtx({ userId: 'admin:old', isAdmin: true }))).toThrow(
      ForbiddenException,
    );
  });
});
