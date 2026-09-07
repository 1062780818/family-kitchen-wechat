import 'reflect-metadata';
import { envValidationSchema } from './env.validation';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://test.invalid/c01',
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  WX_APPID: 'test-app-id',
  WX_APP_SECRET: 'test-app-secret',
};

describe('environment access flags', () => {
  it('starts core services with optional administrator and password login disabled', () => {
    const result = envValidationSchema(base);
    expect(result.ADMIN_ENABLED).toBe('false');
    expect(result.PASSWORD_LOGIN_ENABLED).toBe('false');
  });

  it.each([
    ['missing', { ADMIN_ENABLED: 'true' }],
    ['empty', { ADMIN_ENABLED: 'true', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' }],
    ['partial', { ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'c01-admin' }],
    [
      'legacy defaults',
      { ADMIN_ENABLED: 'true', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin123456' },
    ],
  ])('fails startup for %s enabled administrator configuration', (_name, config) => {
    expect(() => envValidationSchema({ ...base, ...config })).toThrow('Invalid env');
  });

  it('accepts an explicitly enabled administrator with complete non-default credentials', () => {
    const result = envValidationSchema({
      ...base,
      ADMIN_ENABLED: 'true',
      ADMIN_USERNAME: 'c01-admin',
      ADMIN_PASSWORD: 'C01-Isolated-Admin-Password',
    });
    expect(result.ADMIN_ENABLED).toBe('true');
  });

  it('forbids enabling the password entry in production', () => {
    expect(() =>
      envValidationSchema({
        ...base,
        NODE_ENV: 'production',
        PASSWORD_LOGIN_ENABLED: 'true',
      }),
    ).toThrow('PASSWORD_LOGIN_ENABLED cannot be enabled in production');
  });

  it('allows the password entry only when an isolated non-production environment enables it', () => {
    const result = envValidationSchema({ ...base, PASSWORD_LOGIN_ENABLED: 'true' });
    expect(result.PASSWORD_LOGIN_ENABLED).toBe('true');
  });
});
