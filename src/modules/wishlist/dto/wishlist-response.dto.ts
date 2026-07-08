import { ApiProperty } from '@nestjs/swagger';
import { PublicProductCardDto } from '../../products/dto/product-response.dto';

export class WishlistItemDto {
  @ApiProperty({
    description: 'Wishlist product card',
    type: PublicProductCardDto,
  })
  product!: PublicProductCardDto;

  @ApiProperty({
    description: 'Timestamp when the product was added to the wishlist',
    example: '2026-07-08T12:00:00.000Z',
  })
  addedAt!: Date;

  @ApiProperty({
    description: 'Whether the product is currently active and available',
    example: true,
  })
  available!: boolean;
}

export class AddWishlistItemResponseDto {
  @ApiProperty({
    description: 'Whether the product is now in the wishlist',
    example: true,
  })
  added!: boolean;
}
