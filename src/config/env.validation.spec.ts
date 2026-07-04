import { validate } from './env.validation';

describe('env.validation', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CORS_ORIGINS: 'http://localhost:3000',
    CLERK_SECRET_KEY: 'sk_test_xxx',
    CLERK_WEBHOOK_SECRET: 'whsec_xxx',
  };

  it('throws when a required variable is missing', () => {
    const { DATABASE_URL, ...withoutDatabaseUrl } = validEnv;
    void DATABASE_URL;

    expect(() => validate(withoutDatabaseUrl)).toThrow(
      /Environment validation failed/,
    );
  });

  it('throws when NODE_ENV is not a recognized value', () => {
    expect(() => validate({ ...validEnv, NODE_ENV: 'bogus' })).toThrow(
      /Environment validation failed/,
    );
  });

  it('returns a populated instance with defaults applied for a minimal valid input', () => {
    const config = validate(validEnv);

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(config.CARD_ORDER_EXPIRY_MINUTES).toBe(60);
    expect(config.GUEST_TOKEN_TTL_DAYS).toBe(30);
    expect(config.ANON_CART_TTL_DAYS).toBe(7);
    expect(config.GEIDEA_MERCHANT_PUBLIC_KEY).toBeUndefined();
  });
});
