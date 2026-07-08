import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

export const CLOUDINARY_CLIENT = Symbol('CLOUDINARY_CLIENT');

// Narrow structural view of the SDK — only what UploadsService uses,
// so tests can provide a small fake via .overrideProvider(CLOUDINARY_CLIENT).
export interface CloudinaryClient {
  utils: {
    api_sign_request(
      params: Record<string, string | number>,
      apiSecret: string,
    ): string;
  };
  uploader: {
    destroy(publicId: string): Promise<{ result?: string }>;
  };
}

export const cloudinaryClientProvider = {
  provide: CLOUDINARY_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): CloudinaryClient => {
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('cloudinary.cloudName'),
      api_key: config.getOrThrow<string>('cloudinary.apiKey'),
      api_secret: config.getOrThrow<string>('cloudinary.apiSecret'),
      secure: true,
      signature_algorithm: 'sha256',
    });

    return cloudinary;
  },
};
