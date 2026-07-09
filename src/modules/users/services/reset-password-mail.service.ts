import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import {
  RESEND_CLIENT,
  type ResendClient,
} from '../../mail/resend-client.provider';

@Injectable()
export class ResetPasswordMailService {
  constructor(
    private readonly config: ConfigService,
    @Inject(RESEND_CLIENT)
    private readonly resend: ResendClient | null,
  ) {}

  async sendPasswordResetNotice(email: string, name: string): Promise<void> {
    const from = this.config.get<string>('mail.from');
    if (!this.resend || !from) {
      throw this.unavailable();
    }

    try {
      const result = await this.resend.emails.send({
        from,
        to: email,
        subject: 'Your SG Couture password was reset',
        text: `Hello ${name}, an SG Couture administrator reset your password. Use the password-reset flow on the sign-in screen to choose a private password before signing in.`,
      });

      if (result.error) {
        throw new Error(result.error.message);
      }
    } catch {
      throw this.unavailable();
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Password reset notice could not be sent',
    });
  }
}
