import { ConfigService } from '@nestjs/config';
import type { CloudinaryClient } from './cloudinary-client.provider';
import { UploadsService } from './uploads.service';

describe('UploadsService', () => {
  const destroy = jest.fn<Promise<{ result?: string }>, [string]>();
  const cloudinary = {
    utils: { api_sign_request: jest.fn().mockReturnValue('signed') },
    uploader: { destroy },
  } satisfies CloudinaryClient;
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'cloudinary.apiSecret': 'secret',
        'cloudinary.apiKey': 'api-key',
        'cloudinary.cloudName': 'cloud',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const logger = { warn: jest.fn() };
  const service = new UploadsService(cloudinary, config, logger as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_783_526_400_000);
  });

  afterEach(() => jest.restoreAllMocks());

  it('signs the exact upload parameters with sha256', () => {
    expect(service.createUploadSignature({ folder: 'products' })).toEqual({
      signature: 'signed',
      timestamp: 1_783_526_400,
      apiKey: 'api-key',
      cloudName: 'cloud',
      folder: 'products',
      allowedFormats: 'jpg,jpeg,png,webp',
    });
    expect(cloudinary.utils.api_sign_request).toHaveBeenCalledWith(
      {
        timestamp: 1_783_526_400,
        folder: 'products',
        allowed_formats: 'jpg,jpeg,png,webp',
      },
      'secret',
    );
  });

  it('swallows Cloudinary destroy failures', async () => {
    destroy.mockRejectedValueOnce(new Error('down'));

    await expect(service.destroyImage('image-id')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: 'image-id' }),
      'Cloudinary destroy failed',
    );
  });
});
