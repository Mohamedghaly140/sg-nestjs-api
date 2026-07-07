import type { WebhookEvent } from '@clerk/backend';
import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Webhook } from 'svix';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { Public } from '../../../common/decorators/public.decorator';
import { ClerkSyncService } from '../services/clerk-sync.service';

@ApiTags('webhooks')
@Public()
@Controller('webhooks/clerk')
export class ClerkWebhookController {
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
        throw new Error('Missing webhook signature data');
      }

      event = new Webhook(
        this.config.getOrThrow<string>('clerk.webhookSecret'),
      ).verify(request.rawBody.toString('utf8'), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as WebhookEvent;
    } catch {
      throw new UnauthorizedException({
        code: ERROR_CODES.INVALID_WEBHOOK_SIGNATURE,
        message: 'Invalid webhook signature',
      });
    }

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
}
