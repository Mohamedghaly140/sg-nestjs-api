import { Injectable } from '@nestjs/common';
import { ProductStatus } from '../../generated/prisma/client';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryPublicProductsDto } from './dto/query-public-products.dto';
import {
  buildPublicProductsOrderBy,
  buildPublicProductsWhere,
} from './utils/build-public-products-where';

const PRODUCT_CARD_SELECT = {
  id: true,
  name: true,
  slug: true,
  imageUrl: true,
  price: true,
  discount: true,
  priceAfterDiscount: true,
  ratingsAverage: true,
  ratingsQuantity: true,
  featured: true,
  sizes: true,
  colors: true,
  quantity: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProducts(query: QueryPublicProductsDto) {
    const where = buildPublicProductsWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [products, totalItems] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: PRODUCT_CARD_SELECT,
        skip,
        take: query.limit,
        orderBy: buildPublicProductsOrderBy(query.sort),
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async getBySlug(slug: string) {
    const product = await this.prisma.product.findFirstOrThrow({
      where: { slug, status: ProductStatus.ACTIVE },
      select: {
        ...PRODUCT_CARD_SELECT,
        description: true,
        category: { select: { id: true, name: true, slug: true } },
        subCategories: {
          select: {
            subCategory: { select: { id: true, name: true, slug: true } },
          },
          orderBy: { subCategory: { name: 'asc' } },
        },
        images: {
          select: { id: true, imageId: true, imageUrl: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return {
      ...product,
      subCategories: product.subCategories.map((join) => join.subCategory),
    };
  }
}
