import { ApiProperty } from '@nestjs/swagger';

export class UploadSignatureResponseDto {
  @ApiProperty({
    description: 'Cloudinary API signature for the signed parameters',
    example: '6f746573742d7369676e6174757265',
  })
  signature: string;

  @ApiProperty({
    description: 'Unix timestamp included in the signed parameters',
    example: 1783526400,
  })
  timestamp: number;

  @ApiProperty({
    description: 'Cloudinary API key used by the dashboard upload widget',
    example: '1234567890',
  })
  apiKey: string;

  @ApiProperty({
    description: 'Cloudinary cloud name',
    example: 'sg-couture',
  })
  cloudName: string;

  @ApiProperty({
    description: 'Signed Cloudinary folder',
    example: 'products',
  })
  folder: string;

  @ApiProperty({
    description: 'Comma-separated image formats accepted by the dashboard',
    example: 'jpg,jpeg,png,webp',
  })
  allowedFormats: string;
}
