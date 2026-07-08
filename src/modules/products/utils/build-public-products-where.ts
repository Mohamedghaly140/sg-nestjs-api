import { Prisma, ProductStatus } from '../../../generated/prisma/client';
import { QueryPublicProductsDto } from '../dto/query-public-products.dto';

export function buildPublicProductsWhere(
  query: QueryPublicProductsDto,
): Prisma.ProductWhereInput {
  return {
    status: ProductStatus.ACTIVE,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.subCategory
      ? {
          subCategories: {
            some: { subCategory: { slug: query.subCategory } },
          },
        }
      : {}),
    ...(query.minPrice === undefined && query.maxPrice === undefined
      ? {}
      : {
          priceAfterDiscount: {
            ...(query.minPrice === undefined ? {} : { gte: query.minPrice }),
            ...(query.maxPrice === undefined ? {} : { lte: query.maxPrice }),
          },
        }),
    ...(query.sizes?.length ? { sizes: { hasSome: query.sizes } } : {}),
    ...(query.colors?.length ? { colors: { hasSome: query.colors } } : {}),
    ...(query.featured === undefined ? {} : { featured: query.featured }),
  };
}

export function buildPublicProductsOrderBy(
  sort?: QueryPublicProductsDto['sort'],
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ priceAfterDiscount: 'asc' }, { createdAt: 'desc' }];
    case 'price_desc':
      return [{ priceAfterDiscount: 'desc' }, { createdAt: 'desc' }];
    case 'best_selling':
      return [{ sold: 'desc' }, { createdAt: 'desc' }];
    case 'top_rated':
      return [
        { ratingsAverage: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ];
    case 'newest':
    default:
      return [{ createdAt: 'desc' }];
  }
}
