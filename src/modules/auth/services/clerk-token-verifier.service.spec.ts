import { verifyToken } from '@clerk/backend';
import { ConfigService } from '@nestjs/config';
import { ClerkTokenVerifierService } from './clerk-token-verifier.service';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

describe('ClerkTokenVerifierService', () => {
  it('verifies with the configured key, parties, and clock skew', async () => {
    jest.mocked(verifyToken).mockResolvedValue({ sub: 'user_1' });
    const config = {
      getOrThrow: jest.fn().mockReturnValue('sk_test'),
      get: jest.fn().mockReturnValue(['https://shop.test']),
    } as unknown as ConfigService;

    const service = new ClerkTokenVerifierService(config);
    await expect(service.verify('token')).resolves.toMatchObject({
      sub: 'user_1',
    });
    expect(verifyToken).toHaveBeenCalledWith('token', {
      secretKey: 'sk_test',
      authorizedParties: ['https://shop.test'],
      clockSkewInMs: 5_000,
    });
  });
});
