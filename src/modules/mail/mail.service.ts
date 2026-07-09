import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { RESEND_CLIENT, type ResendClient } from './resend-client.provider';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  context?: {
    event: string;
    orderId?: string;
    humanOrderId?: string;
  };
}

@Injectable()
export class MailService {
  private readonly maxAttempts = 3;
  private readonly retryBaseDelayMs = 100;

  constructor(
    @Inject(RESEND_CLIENT)
    private readonly resend: ResendClient | null,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  async sendEmail(input: SendEmailInput): Promise<void> {
    const from = this.config.get<string>('mail.from');
    if (!this.resend || !from) {
      this.logger.warn(
        {
          event: input.context?.event,
          orderId: input.context?.orderId,
          humanOrderId: input.context?.humanOrderId,
        },
        'Mail is not configured; skipping email',
      );
      return;
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const result = await this.resend.emails.send({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }
        return;
      } catch (error: unknown) {
        if (attempt === this.maxAttempts) {
          this.logger.error(
            {
              audit: true,
              err: error,
              event: input.context?.event,
              orderId: input.context?.orderId,
              humanOrderId: input.context?.humanOrderId,
              attempts: attempt,
            },
            'Email delivery failed after retries',
          );
          return;
        }

        this.logger.warn(
          {
            err: error,
            event: input.context?.event,
            orderId: input.context?.orderId,
            humanOrderId: input.context?.humanOrderId,
            attempt,
          },
          'Email delivery failed; retrying',
        );
        await this.delay(this.retryDelayMs(attempt));
      }
    }
  }

  private retryDelayMs(attempt: number): number {
    return this.retryBaseDelayMs * 2 ** (attempt - 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
