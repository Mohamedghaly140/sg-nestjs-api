import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const UPLOAD_FOLDERS = ['products', 'categories'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export class CreateUploadSignatureDto {
  @ApiProperty({
    description: 'Cloudinary folder to sign for dashboard direct uploads',
    enum: UPLOAD_FOLDERS,
    example: 'products',
  })
  @IsIn(UPLOAD_FOLDERS)
  folder: UploadFolder;
}
