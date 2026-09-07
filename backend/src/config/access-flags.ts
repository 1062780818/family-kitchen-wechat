import type { ConfigService } from '@nestjs/config';

export const LEGACY_ADMIN_USERNAME = 'admin';
export const LEGACY_ADMIN_PASSWORD = 'admin123456';

export function isExplicitlyEnabled(value: unknown): boolean {
  return value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');
}

export function resolveAdminCredentials(
  config: Pick<ConfigService, 'get'>,
): { username: string; password: string } | null {
  if (!isExplicitlyEnabled(config.get('ADMIN_ENABLED'))) return null;

  const username = config.get<string>('ADMIN_USERNAME')?.trim() ?? '';
  const password = config.get<string>('ADMIN_PASSWORD') ?? '';
  if (!username || password.length < 12) return null;
  if (username === LEGACY_ADMIN_USERNAME && password === LEGACY_ADMIN_PASSWORD) return null;
  if (password === LEGACY_ADMIN_PASSWORD) return null;
  return { username, password };
}

export function isPasswordLoginEnabled(config: Pick<ConfigService, 'get'>): boolean {
  const environment = config.get<string>('NODE_ENV', 'development');
  return environment !== 'production' && isExplicitlyEnabled(config.get('PASSWORD_LOGIN_ENABLED'));
}
