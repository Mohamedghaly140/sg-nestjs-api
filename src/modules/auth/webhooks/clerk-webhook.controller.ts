import type { WebhookEvent } from '@clerk/backend';
import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { Public } from '../../../common/decorators/public.decorator';
import { ClerkSyncService } from '../services/clerk-sync.service';

// Rate-limit exempt: the Svix signature is verified before any processing
// (401 on failure), so IP-based throttling only risks false-positive 429s
// during legitimate Clerk retry/backfill floods. See ARCHITECTURE.md §7.
@ApiTags('webhooks')
@Public()
@SkipThrottle()
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly clerkSync: ClerkSyncService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Synchronize Clerk user lifecycle events' })
  @ApiResponse({
    status: 200,
    description: 'Event acknowledged',
    schema: {
      example: { received: true },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid Svix signature' })
  async handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ): Promise<{ received: true }> {
    let event: WebhookEvent;

    try {
      if (!request.rawBody || !svixId || !svixTimestamp || !svixSignature) {
        const missingSignatureData = [
          !request.rawBody ? 'rawBody' : undefined,
          !svixId ? 'svixId' : undefined,
          !svixTimestamp ? 'svixTimestamp' : undefined,
          !svixSignature ? 'svixSignature' : undefined,
        ].filter((field): field is string => field !== undefined);

        this.logger.warn(
          { missingSignatureData },
          'Clerk webhook rejected: missing signature data',
        );

        throw new UnauthorizedException({
          code: ERROR_CODES.INVALID_WEBHOOK_SIGNATURE,
          message: 'Invalid webhook signature',
        });
      }

      event = new Webhook(
        this.config.getOrThrow<string>('clerk.webhookSecret'),
      ).verify(request.rawBody.toString('utf8'), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as WebhookEvent;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(
        { err: error, errorMessage: this.getErrorMessage(error) },
        'Clerk webhook rejected: signature verification failed',
      );

      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_WEBHOOK_SIGNATURE,
        message: 'Invalid webhook signature',
      });
    }

    this.logger.log(
      { eventType: event.type, clerkUserId: event.data.id },
      'Clerk webhook verified',
    );

    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await this.clerkSync.upsertFromWebhookUser(event.data);
        break;
      case 'user.deleted':
        await this.clerkSync.deleteFromWebhookUser(event.data);
        break;
      default:
        break;
    }

    return { received: true };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
