import type { CloudinaryClient } from '../../src/modules/uploads/cloudinary-client.provider';

export function createFakeCloudinaryClient(): jest.Mocked<CloudinaryClient> {
  return {
    utils: {
      api_sign_request: jest.fn().mockReturnValue('fake-signature'),
    },
    uploader: {
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  };
}
