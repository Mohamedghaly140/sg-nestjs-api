import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AddWishlistItemResponseDto,
  WishlistItemDto,
} from './dto/wishlist-response.dto';
import { WishlistService } from './wishlist.service';

@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'List my wishlist' })
  @ApiResponse({ status: 200, type: WishlistItemDto, isArray: true })
  list(@CurrentUser('id') userId: string) {
    return this.wishlist.list(userId);
  }

  @Put(':productId')
  @ApiOperation({ summary: 'Add a product to my wishlist' })
  @ApiParam({
    name: 'productId',
    description: 'Product ID',
    example: 'ckvprod123',
  })
  @ApiResponse({ status: 200, type: AddWishlistItemResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  add(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.add(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a product from my wishlist' })
  @ApiParam({
    name: 'productId',
    description: 'Product ID',
    example: 'ckvprod123',
  })
  @ApiResponse({ status: 204, description: 'Wishlist product removed' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.wishlist.remove(userId, productId);
  }
}
