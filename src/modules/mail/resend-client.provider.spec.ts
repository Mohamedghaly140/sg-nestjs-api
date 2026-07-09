import { ConfigService } from '@nestjs/config';
import { resendClientProvider } from './resend-client.provider';

describe('resendClientProvider', () => {
  it('returns null when the API key is unset', () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(resendClientProvider.useFactory(config)).toBeNull();
  });

  it('constructs a Resend client when the API key is present', () => {
    const config = {
      get: jest.fn().mockReturnValue('re_test'),
    } as unknown as ConfigService;

    const client = resendClientProvider.useFactory(config);

    expect(client).not.toBeNull();
    expect(typeof client?.emails.send).toBe('function');
  });
});
