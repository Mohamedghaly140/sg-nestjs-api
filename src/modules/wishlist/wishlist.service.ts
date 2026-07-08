import { Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { ProductStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PRODUCT_CARD_SELECT } from '../products/products.service';

const WISHLIST_PRODUCT_SELECT = {
  ...PRODUCT_CARD_SELECT,
  status: true,
} as const;

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.userWishlist.findMany({
      where: { userId },
      select: {
        addedAt: true,
        product: { select: WISHLIST_PRODUCT_SELECT },
      },
      orderBy: { addedAt: 'desc' },
    });

    return items.map(({ addedAt, product }) => {
      const { status, ...productCard } = product;
      return {
        product: productCard,
        addedAt,
        available: status === ProductStatus.ACTIVE,
      };
    });
  }

  async add(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException({
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        message: 'Product not found',
      });
    }

    await this.prisma.userWishlist.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });

    return { added: true };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.userWishlist.deleteMany({
      where: { userId, productId },
    });
  }
}
