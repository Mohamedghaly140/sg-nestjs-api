import { createClerkClient } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';

export const CLERK_CLIENT = Symbol('CLERK_CLIENT');
export type ClerkClient = ReturnType<typeof createClerkClient>;

export const clerkClientProvider = {
  provide: CLERK_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ClerkClient =>
    createClerkClient({
      secretKey: config.getOrThrow<string>('clerk.secretKey'),
    }),
};
