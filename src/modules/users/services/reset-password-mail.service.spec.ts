import { ConfigService } from '@nestjs/config';
import { ResetPasswordMailService } from './reset-password-mail.service';

const send = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send },
  })),
}));

describe('ResetPasswordMailService', () => {
  it('returns SERVICE_UNAVAILABLE when mail config is absent', async () => {
    const service = new ResetPasswordMailService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    await expect(
      service.sendPasswordResetNotice('user@test.dev', 'User'),
    ).rejects.toMatchObject({
      response: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('sends a one-off password-reset notice', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'mail.resendApiKey' ? 're_test' : 'SG <mail@test.dev>',
      ),
    } as unknown as ConfigService;
    send.mockResolvedValueOnce({ data: { id: 'email_1' }, error: null });

    await expect(
      new ResetPasswordMailService(config).sendPasswordResetNotice(
        'user@test.dev',
        'User',
      ),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@test.dev' }),
    );
  });
});
