import { ProductStatus } from '../../generated/prisma/client';
import { AdminProductsService } from './admin-products.service';

describe('AdminProductsService', () => {
  const detail = {
    id: 'prod_1',
    name: 'Dress',
    slug: 'dress',
    description: 'A dress',
    quantity: 5,
    sold: 2,
    price: '100.00',
    discount: '0.00',
    priceAfterDiscount: '100.00',
    sizes: ['M'],
    colors: ['Black'],
    imageId: 'img_1',
    imageUrl: 'https://example.test/dress.jpg',
    status: ProductStatus.ACTIVE,
    featured: false,
    categoryId: 'cat_1',
    category: { id: 'cat_1', name: 'Dresses', slug: 'dresses' },
    subCategories: [
      { subCategory: { id: 'sub_1', name: 'Evening', slug: 'evening' } },
    ],
    images: [],
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
  const prisma = {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    category: {
      findMany: jest.fn(),
    },
    subCategory: {
      findMany: jest.fn(),
    },
  };
  const service = new AdminProductsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findUniqueOrThrow.mockResolvedValue(detail);
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat_1', name: 'Dresses' },
    ]);
    prisma.subCategory.findMany.mockResolvedValue([
      { id: 'sub_1', name: 'Evening', categoryId: 'cat_1' },
    ]);
  });

  it('lists admin products applying search, status, category, and featured filters', async () => {
    await service.listProducts({
      page: 1,
      limit: 20,
      search: 'dress',
      status: ProductStatus.ACTIVE,
      categoryId: 'cat_1',
      featured: true,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'dress', mode: 'insensitive' } },
            { slug: { contains: 'dress', mode: 'insensitive' } },
          ],
          status: ProductStatus.ACTIVE,
          categoryId: 'cat_1',
          featured: true,
        },
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('omits unset filters entirely from the where clause', async () => {
    await service.listProducts({ page: 1, limit: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('returns category filter options and form data', async () => {
    await expect(service.getFilterOptions()).resolves.toEqual({
      categories: [{ id: 'cat_1', name: 'Dresses' }],
    });
    await expect(service.getFormData()).resolves.toEqual({
      categories: [{ id: 'cat_1', name: 'Dresses' }],
      subCategories: [{ id: 'sub_1', name: 'Evening', categoryId: 'cat_1' }],
    });
  });

  it('gets detail with flattened sub-categories', async () => {
    await expect(service.getDetail('prod_1')).resolves.toMatchObject({
      id: 'prod_1',
      subCategories: [{ id: 'sub_1', name: 'Evening', slug: 'evening' }],
    });
  });

  it('gets the edit-form shape with subCategoryIds', async () => {
    await expect(service.getForm('prod_1')).resolves.toMatchObject({
      id: 'prod_1',
      categoryId: 'cat_1',
      subCategoryIds: ['sub_1'],
      images: [],
    });
  });
});
