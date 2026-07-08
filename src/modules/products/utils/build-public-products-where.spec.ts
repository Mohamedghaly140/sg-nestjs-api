import { ProductStatus } from '../../../generated/prisma/client';
import { QueryPublicProductsDto } from '../dto/query-public-products.dto';
import {
  buildPublicProductsOrderBy,
  buildPublicProductsWhere,
} from './build-public-products-where';

describe('buildPublicProductsWhere', () => {
  it('always limits results to ACTIVE products', () => {
    expect(buildPublicProductsWhere({ page: 1, limit: 20 })).toEqual({
      status: ProductStatus.ACTIVE,
    });
  });

  it('combines all storefront filters', () => {
    const query: QueryPublicProductsDto = {
      page: 1,
      limit: 20,
      search: 'satin',
      category: 'dresses',
      subCategory: 'evening-dresses',
      minPrice: 100,
      maxPrice: 500,
      sizes: ['S', 'M'],
      colors: ['Black'],
      featured: true,
    };

    expect(buildPublicProductsWhere(query)).toMatchObject({
      status: ProductStatus.ACTIVE,
      OR: [
        { name: { contains: 'satin', mode: 'insensitive' } },
        { description: { contains: 'satin', mode: 'insensitive' } },
      ],
      category: { slug: 'dresses' },
      subCategories: { some: { subCategory: { slug: 'evening-dresses' } } },
      priceAfterDiscount: { gte: 100, lte: 500 },
      sizes: { hasSome: ['S', 'M'] },
      colors: { hasSome: ['Black'] },
      featured: true,
    });
  });

  it('maps the full sort set', () => {
    expect(buildPublicProductsOrderBy()).toEqual([{ createdAt: 'desc' }]);
    expect(buildPublicProductsOrderBy('price_asc')).toEqual([
      { priceAfterDiscount: 'asc' },
      { createdAt: 'desc' },
    ]);
    expect(buildPublicProductsOrderBy('price_desc')).toEqual([
      { priceAfterDiscount: 'desc' },
      { createdAt: 'desc' },
    ]);
    expect(buildPublicProductsOrderBy('best_selling')).toEqual([
      { sold: 'desc' },
      { createdAt: 'desc' },
    ]);
    expect(buildPublicProductsOrderBy('top_rated')).toEqual([
      { ratingsAverage: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ]);
  });
});
