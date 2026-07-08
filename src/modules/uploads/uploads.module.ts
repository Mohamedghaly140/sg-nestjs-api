import { Module } from '@nestjs/common';
import { cloudinaryClientProvider } from './cloudinary-client.provider';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [cloudinaryClientProvider, UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
