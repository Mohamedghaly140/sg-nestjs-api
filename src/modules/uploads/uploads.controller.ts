import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MANAGER_PLUS, Roles } from '../../common/decorators/roles.decorator';
import { CreateUploadSignatureDto } from './dto/create-upload-signature.dto';
import { UploadSignatureResponseDto } from './dto/upload-signature-response.dto';
import { UploadsService } from './uploads.service';

@ApiTags('admin/uploads')
@ApiBearerAuth()
@Controller('admin/uploads')
@Roles(...MANAGER_PLUS)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('signature')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create signed Cloudinary upload parameters' })
  @ApiResponse({ status: 200, type: UploadSignatureResponseDto })
  createSignature(@Body() dto: CreateUploadSignatureDto) {
    return this.uploads.createUploadSignature(dto);
  }
}
