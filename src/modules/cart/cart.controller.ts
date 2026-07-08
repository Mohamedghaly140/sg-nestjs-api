import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { CartIdentity } from './decorators/cart-identity.decorator';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import type { CartServiceIdentity } from './interfaces/cart-service-identity.interface';
import { CartService } from './cart.service';
import {
  clearCartSessionCookie,
  setCartSessionCookie,
} from './utils/cart-cookie.util';

const INSUFFICIENT_STOCK_EXAMPLE = {
  status: 'error',
  message: 'Insufficient stock for one or more items',
  code: 'INSUFFICIENT_STOCK',
  errors: [{ productId: 'ckvprod123', requested: 5, available: 3 }],
};

@ApiTags('cart')
@Public()
@UseGuards(OptionalAuthGuard)
@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current cart' })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async getCart(
    @CartIdentity() identity: CartServiceIdentity,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponseDto> {
    const result = await this.cartService.getCart(identity);
    if (result.clearAnonCookie) {
      clearCartSessionCookie(response);
    }
    return result.cart;
  }

  @Post('items')
  @ApiOperation({ summary: 'Add cart item' })
  @ApiResponse({ status: 201, type: CartResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Requested cart quantity exceeds product stock',
    schema: { example: INSUFFICIENT_STOCK_EXAMPLE },
  })
  @ApiResponse({
    status: 422,
    description: 'Selected color or size is not available for the product',
  })
  async addItem(
    @CartIdentity() identity: CartServiceIdentity,
    @Body() dto: AddCartItemDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponseDto> {
    const result = await this.cartService.addItem(identity, dto);
    if (result.clearAnonCookie) {
      clearCartSessionCookie(response);
    }
    if (result.mintedSessionToken) {
      setCartSessionCookie(
        response,
        result.mintedSessionToken,
        this.anonCartTtlDays(),
      );
      return { ...result.cart, sessionToken: result.mintedSessionToken };
    }
    return result.cart;
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiParam({
    name: 'itemId',
    description: 'Cart item ID',
    example: 'ckvcartitem123',
  })
  @ApiResponse({ status: 200, type: CartResponseDto })
  @ApiResponse({
    status: 409,
    description: 'Requested cart quantity exceeds product stock',
    schema: { example: INSUFFICIENT_STOCK_EXAMPLE },
  })
  async updateItem(
    @CartIdentity() identity: CartServiceIdentity,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponseDto> {
    const result = await this.cartService.updateItem(identity, itemId, dto);
    if (result.clearAnonCookie) {
      clearCartSessionCookie(response);
    }
    return result.cart;
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove cart item' })
  @ApiParam({
    name: 'itemId',
    description: 'Cart item ID',
    example: 'ckvcartitem123',
  })
  @ApiResponse({ status: 200, type: CartResponseDto })
  async removeItem(
    @CartIdentity() identity: CartServiceIdentity,
    @Param('itemId') itemId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartResponseDto> {
    const result = await this.cartService.removeItem(identity, itemId);
    if (result.clearAnonCookie) {
      clearCartSessionCookie(response);
    }
    return result.cart;
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear cart' })
  @ApiResponse({ status: 204, description: 'Cart cleared' })
  async clearCart(
    @CartIdentity() identity: CartServiceIdentity,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.cartService.clearCart(identity);
    if (result.clearAnonCookie) {
      clearCartSessionCookie(response);
    }
  }

  private anonCartTtlDays(): number {
    return this.configService.get<number>('cart.anonCartTtlDays') ?? 7;
  }
}
