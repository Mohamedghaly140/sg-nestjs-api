import { ConfigService } from '@nestjs/config';
import { CreateEmailOptions, CreateEmailResponse, Resend } from 'resend';

export const RESEND_CLIENT = Symbol('RESEND_CLIENT');

// Narrow structural view of the SDK so tests and e2e can provide small fakes.
export interface ResendClient {
  emails: {
    send(payload: CreateEmailOptions): Promise<CreateEmailResponse>;
  };
}

export const resendClientProvider = {
  provide: RESEND_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ResendClient | null => {
    const apiKey = config.get<string>('mail.resendApiKey');
    if (!apiKey) {
      return null;
    }

    return new Resend(apiKey);
  },
};
