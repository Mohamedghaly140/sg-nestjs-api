import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));

export const corsConfig = registerAs('cors', () => ({
  origins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
}));

export const clerkConfig = registerAs('clerk', () => ({
  secretKey: process.env.CLERK_SECRET_KEY,
  webhookSecret: process.env.CLERK_WEBHOOK_SECRET,
  authorizedParties: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
}));

export const geideaConfig = registerAs('geidea', () => ({
  merchantPublicKey: process.env.GEIDEA_MERCHANT_PUBLIC_KEY,
  apiPassword: process.env.GEIDEA_API_PASSWORD,
  baseUrl: process.env.GEIDEA_BASE_URL,
  callbackUrl: process.env.GEIDEA_CALLBACK_URL,
}));

export const cloudinaryConfig = registerAs('cloudinary', () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
}));

export const mailConfig = registerAs('mail', () => ({
  resendApiKey: process.env.RESEND_API_KEY,
  from: process.env.MAIL_FROM,
  storefrontUrl: process.env.STOREFRONT_URL,
}));

export const cartConfig = registerAs('cart', () => ({
  cardOrderExpiryMinutes: parseInt(
    process.env.CARD_ORDER_EXPIRY_MINUTES ?? '60',
    10,
  ),
  guestTokenTtlDays: parseInt(process.env.GUEST_TOKEN_TTL_DAYS ?? '30', 10),
  anonCartTtlDays: parseInt(process.env.ANON_CART_TTL_DAYS ?? '7', 10),
}));

export default [
  appConfig,
  databaseConfig,
  corsConfig,
  clerkConfig,
  geideaConfig,
  cloudinaryConfig,
  mailConfig,
  cartConfig,
];
