import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CartService } from '../cart/cart.service';
import { CartIdentity } from '../cart/decorators/cart-identity.decorator';
import type { CartServiceIdentity } from '../cart/interfaces/cart-service-identity.interface';
import { clearCartSessionCookie } from '../cart/utils/cart-cookie.util';
import { CouponsService } from './coupons.service';
import {
  ValidateCouponDto,
  ValidateCouponResponseDto,
} from './dto/validate-coupon.dto';

@ApiTags('coupons')
@Public()
@UseGuards(OptionalAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly cartService: CartService,
  ) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a coupon against the current cart' })
  @ApiResponse({ status: 200, type: ValidateCouponResponseDto })
  @ApiResponse({ status: 404, description: 'Coupon code was not found' })
  @ApiResponse({
    status: 409,
    description: 'Coupon is exhausted or reached the per-user limit',
  })
  @ApiResponse({
    status: 422,
    description: 'Coupon is expired or inactive',
  })
  async validateCoupon(
    @CartIdentity() identity: CartServiceIdentity,
    @Body() dto: ValidateCouponDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ValidateCouponResponseDto> {
    const cartResult = await this.cartService.getCart(identity);
    if (cartResult.clearAnonCookie) {
      clearCartSessionCookie(response);
    }

    return this.couponsService.validateCoupon(
      dto,
      identity,
      cartResult.cart.totalPriceAfterDiscount,
    );
  }
}
