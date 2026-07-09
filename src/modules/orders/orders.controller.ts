import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CartIdentity } from '../cart/decorators/cart-identity.decorator';
import type { CartServiceIdentity } from '../cart/interfaces/cart-service-identity.interface';
import { CheckoutDto } from './dto/checkout.dto';
import { ClaimOrderDto } from './dto/claim-order.dto';
import { GuestCheckoutDto } from './dto/guest-checkout.dto';
import {
  GuestOrderResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { OrderSummaryDto } from './dto/order-summary.dto';
import { QueryMyOrdersDto } from './dto/query-my-orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an order from my cart' })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Insufficient stock or coupon usage conflict',
  })
  @ApiResponse({
    status: 422,
    description: 'Empty cart, invalid line, or unavailable shipping',
  })
  checkout(
    @CurrentUser('id') userId: string,
    @Body() dto: CheckoutDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.checkout(userId, dto);
  }

  @Public()
  @UseGuards(OptionalAuthGuard)
  @Post('guest')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a guest order from an anonymous cart' })
  @ApiResponse({ status: 201, type: GuestOrderResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Insufficient stock or coupon usage conflict',
  })
  @ApiResponse({
    status: 422,
    description: 'Empty anonymous cart, invalid line, or unavailable shipping',
  })
  checkoutGuest(
    @CartIdentity() identity: CartServiceIdentity,
    @Body() dto: GuestCheckoutDto,
  ): Promise<OrderResponseDto & { claimToken: 'sent-by-email' }> {
    return this.ordersService.checkoutGuest(identity, dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my orders' })
  @ApiResponse({ status: 200, type: [OrderSummaryDto] })
  listMine(
    @CurrentUser('id') userId: string,
    @Query() query: QueryMyOrdersDto,
  ) {
    return this.ordersService.listMine(userId, query);
  }

  @Public()
  @Get('guest/:token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get a guest order by claim token' })
  @ApiParam({
    name: 'token',
    description: 'Guest order claim token',
    example: 'a'.repeat(64),
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Claim token is invalid or expired',
  })
  getGuest(@Param('token') token: string): Promise<OrderResponseDto> {
    return this.ordersService.getGuest(token);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one of my orders' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 'ckvorder123' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Order was not found for this user',
  })
  getMine(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getMine(userId, id);
  }

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Claim a guest order' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Claim token is invalid or expired',
  })
  claim(
    @CurrentUser('id') userId: string,
    @Body() dto: ClaimOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.claim(userId, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel one of my pending unpaid orders' })
  @ApiParam({ name: 'id', description: 'Order ID', example: 'ckvorder123' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Order cannot be cancelled from its current state',
  })
  cancelMine(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.cancelMine(userId, id);
  }
}
