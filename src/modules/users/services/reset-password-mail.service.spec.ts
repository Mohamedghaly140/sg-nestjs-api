import { ConfigService } from '@nestjs/config';
import type { ResendClient } from '../../mail/resend-client.provider';
import { ResetPasswordMailService } from './reset-password-mail.service';

const send = jest.fn();

describe('ResetPasswordMailService', () => {
  it('returns SERVICE_UNAVAILABLE when mail config is absent', async () => {
    const service = new ResetPasswordMailService(
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
      null,
    );
    await expect(
      service.sendPasswordResetNotice('user@test.dev', 'User'),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('sends a one-off password-reset notice', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'mail.from' ? 'SG <mail@test.dev>' : undefined,
      ),
    } as unknown as ConfigService;
    const resend = {
      emails: { send },
    } as unknown as ResendClient;
    send.mockResolvedValueOnce({ data: { id: 'email_1' }, error: null });

    await expect(
      new ResetPasswordMailService(config, resend).sendPasswordResetNotice(
        'user@test.dev',
        'User',
      ),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@test.dev' }),
    );
  });
});
