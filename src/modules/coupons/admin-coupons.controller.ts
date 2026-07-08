import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MANAGER_PLUS, Roles } from '../../common/decorators/roles.decorator';
import { AdminCouponsService } from './admin-coupons.service';
import {
  CouponResponseDto,
  DeactivateCouponResponseDto,
} from './dto/coupon-response.dto';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { QueryAdminCouponsDto } from './dto/query-admin-coupons.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@ApiTags('admin/coupons')
@ApiBearerAuth()
@Controller('admin/coupons')
@Roles(...MANAGER_PLUS)
export class AdminCouponsController {
  constructor(private readonly adminCoupons: AdminCouponsService) {}

  @Get()
  @ApiOperation({ summary: 'List coupons for administration' })
  @ApiResponse({ status: 200, type: CouponResponseDto, isArray: true })
  listCoupons(@Query() query: QueryAdminCouponsDto) {
    return this.adminCoupons.listCoupons(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a coupon' })
  @ApiResponse({ status: 201, type: CouponResponseDto })
  @ApiResponse({ status: 409, description: 'Coupon name already exists' })
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.adminCoupons.createCoupon(dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a coupon' })
  @ApiParam({ name: 'id', description: 'Coupon ID', example: 'ckvcoupon123' })
  @ApiResponse({ status: 200, type: DeactivateCouponResponseDto })
  deactivateCoupon(@Param('id') id: string) {
    return this.adminCoupons.deactivateCoupon(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a coupon' })
  @ApiParam({ name: 'id', description: 'Coupon ID', example: 'ckvcoupon123' })
  @ApiResponse({ status: 200, type: CouponResponseDto })
  @ApiResponse({ status: 409, description: 'Coupon name already exists' })
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.adminCoupons.updateCoupon(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an unused coupon' })
  @ApiParam({ name: 'id', description: 'Coupon ID', example: 'ckvcoupon123' })
  @ApiResponse({ status: 204, description: 'Coupon deleted' })
  @ApiResponse({ status: 409, description: 'Coupon has already been used' })
  async deleteCoupon(@Param('id') id: string): Promise<void> {
    await this.adminCoupons.deleteCoupon(id);
  }
}
