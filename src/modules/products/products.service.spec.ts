import { ProductStatus } from '../../generated/prisma/client';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const prisma = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };
  const service = new ProductsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
  });

  it('lists public products with pagination meta', async () => {
    const card = { id: 'prod_1', name: 'Dress', slug: 'dress' };
    prisma.product.findMany.mockResolvedValueOnce([card]);
    prisma.product.count.mockResolvedValueOnce(25);

    await expect(
      service.listProducts({ page: 2, limit: 12 }),
    ).resolves.toMatchObject({
      data: [card],
      meta: { page: 2, limit: 12, totalItems: 25 },
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 12, take: 12 }),
    );
  });

  it('gets an active product by slug and flattens sub-category joins', async () => {
    prisma.product.findFirstOrThrow.mockResolvedValueOnce({
      id: 'prod_1',
      name: 'Dress',
      slug: 'dress',
      subCategories: [
        { subCategory: { id: 'sub_1', name: 'Evening', slug: 'evening' } },
      ],
      images: [],
    });

    await expect(service.getBySlug('dress')).resolves.toMatchObject({
      id: 'prod_1',
      subCategories: [{ id: 'sub_1', name: 'Evening', slug: 'evening' }],
    });
    expect(prisma.product.findFirstOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'dress', status: ProductStatus.ACTIVE },
      }),
    );
  });
});
