import { plainToInstance } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';
import { LEGACY_ADMIN_PASSWORD, LEGACY_ADMIN_USERNAME, isExplicitlyEnabled } from './access-flags';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  PORT: number = 3000;

  @IsString()
  API_PREFIX: string = '/api/v1';

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN: string = '30d';

  @IsString()
  WX_APPID!: string;

  @IsString()
  WX_APP_SECRET!: string;

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsString()
  STORAGE_DRIVER: string = 'minio';

  @IsInt()
  @Min(1)
  @Max(900)
  MINIO_SIGNED_URL_TTL_SECONDS: number = 900;

  @IsString()
  LOG_LEVEL: string = 'info';

  @IsOptional()
  @IsString()
  LOG_FILE?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsIn(['true', 'false'])
  ADMIN_ENABLED: string = 'false';

  @IsOptional()
  @IsString()
  ADMIN_USERNAME?: string;

  @IsOptional()
  @IsString()
  ADMIN_PASSWORD?: string;

  @IsIn(['true', 'false'])
  PASSWORD_LOGIN_ENABLED: string = 'false';

  @IsOptional()
  @IsString()
  DEEPSEEK_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLAUDE_API_KEY?: string;
}

export function envValidationSchema(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid env: ${errors.map((e) => e.toString()).join('\n')}`);
  }
  if (isExplicitlyEnabled(validated.ADMIN_ENABLED)) {
    const username = validated.ADMIN_USERNAME?.trim() ?? '';
    const password = validated.ADMIN_PASSWORD ?? '';
    if (!username || password.length < 12) {
      throw new Error(
        'Invalid env: ADMIN_ENABLED=true requires non-empty ADMIN_USERNAME and ADMIN_PASSWORD with at least 12 characters',
      );
    }
    if (
      password === LEGACY_ADMIN_PASSWORD ||
      (username === LEGACY_ADMIN_USERNAME && password === LEGACY_ADMIN_PASSWORD)
    ) {
      throw new Error('Invalid env: legacy default administrator credentials are forbidden');
    }
  }
  if (
    validated.NODE_ENV === Environment.Production &&
    isExplicitlyEnabled(validated.PASSWORD_LOGIN_ENABLED)
  ) {
    throw new Error('Invalid env: PASSWORD_LOGIN_ENABLED cannot be enabled in production');
  }
  return validated;
}
