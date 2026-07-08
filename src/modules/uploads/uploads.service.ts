import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import {
  CLOUDINARY_CLIENT,
  type CloudinaryClient,
} from './cloudinary-client.provider';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';
import { UploadSignatureResponseDto } from './dto/upload-signature-response.dto';

const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(CLOUDINARY_CLIENT) private readonly cloudinary: CloudinaryClient,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  createUploadSignature(
    dto: CreateUploadSignatureDto,
  ): UploadSignatureResponseDto {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      timestamp,
      folder: dto.folder,
      allowed_formats: ALLOWED_FORMATS,
    };
    const apiSecret = this.config.getOrThrow<string>('cloudinary.apiSecret');

    // SHA-256 is set once via signature_algorithm in the provider's config().
    const signature = this.cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    return {
      signature,
      timestamp,
      apiKey: this.config.getOrThrow<string>('cloudinary.apiKey'),
      cloudName: this.config.getOrThrow<string>('cloudinary.cloudName'),
      folder: dto.folder,
      allowedFormats: ALLOWED_FORMATS,
    };
  }

  async destroyImage(imageId?: string | null): Promise<void> {
    if (!imageId) return;

    try {
      await this.cloudinary.uploader.destroy(imageId);
    } catch (error: unknown) {
      this.logger.warn({ err: error, imageId }, 'Cloudinary destroy failed');
    }
  }

  async destroyImages(ids: Array<string | null | undefined>): Promise<void> {
    await Promise.allSettled(ids.map((id) => this.destroyImage(id)));
  }
}
