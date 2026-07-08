import { ConfigService } from '@nestjs/config';
import { cloudinaryClientProvider } from './cloudinary-client.provider';

describe('cloudinaryClientProvider', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'cloudinary.cloudName': 'cloud',
        'cloudinary.apiKey': 'api-key',
        'cloudinary.apiSecret': 'secret',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  it('configures the real SDK to sign with sha256', () => {
    const client = cloudinaryClientProvider.useFactory(config);

    const signature = client.utils.api_sign_request(
      { timestamp: 1_783_526_400, folder: 'products' },
      'secret',
    );

    // sha256 hex digest is 64 chars (sha1 would be 40)
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });
});
