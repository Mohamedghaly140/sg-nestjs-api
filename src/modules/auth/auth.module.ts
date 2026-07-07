import { Module } from '@nestjs/common';
import { CLERK_CLIENT, clerkClientProvider } from './clerk-client.provider';
import { ClerkAuthGuard } from './guards/clerk-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ClerkSyncService } from './services/clerk-sync.service';
import { ClerkTokenVerifierService } from './services/clerk-token-verifier.service';
import { ClerkWebhookController } from './webhooks/clerk-webhook.controller';

@Module({
  controllers: [ClerkWebhookController],
  providers: [
    clerkClientProvider,
    ClerkTokenVerifierService,
    ClerkSyncService,
    ClerkAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
  ],
  exports: [
    CLERK_CLIENT,
    ClerkTokenVerifierService,
    ClerkSyncService,
    ClerkAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
