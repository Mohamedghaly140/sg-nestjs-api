import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Only NODE_ENV, PORT, DATABASE_URL, CORS_ORIGINS, CLERK_SECRET_KEY and
 * CLERK_WEBHOOK_SECRET are required to boot right now (docs/CODING_STANDARDS.md §7).
 * Every other documented var is typed/defaulted but optional until its owning
 * phase's module lands (Phase 1 optionally uses Resend for admin password-reset
 * notices; Phase 2 Cloudinary, Phase 7 Geidea, Phase 8 full Resend/mail).
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must be a postgres(ql):// connection string',
  })
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DIRECT_URL must be a postgres(ql):// connection string',
  })
  DIRECT_URL?: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;

  @IsString()
  @IsNotEmpty()
  CLERK_SECRET_KEY: string;

  @IsString()
  @IsNotEmpty()
  CLERK_WEBHOOK_SECRET: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEIDEA_MERCHANT_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  GEIDEA_API_PASSWORD?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  GEIDEA_BASE_URL?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  GEIDEA_CALLBACK_URL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_SECRET?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  MAIL_FROM?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  STOREFRONT_URL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  CARD_ORDER_EXPIRY_MINUTES: number = 60;

  @IsOptional()
  @IsInt()
  @Min(1)
  GUEST_TOKEN_TTL_DAYS: number = 30;

  @IsOptional()
  @IsInt()
  @Min(1)
  ANON_CART_TTL_DAYS: number = 7;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const message = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Environment validation failed:\n${message}`);
  }

  return validatedConfig;
}
