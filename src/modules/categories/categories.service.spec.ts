import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  const category = {
    id: 'cat_1',
    name: 'Dresses',
    slug: 'dresses',
    imageUrl: 'https://example.test/dresses.jpg',
    _count: { products: 4 },
    subCategories: [
      {
        id: 'sub_1',
        name: 'Evening',
        slug: 'evening',
        _count: { products: 2 },
      },
    ],
  };
  const prisma = {
    category: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const service = new CategoriesService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists the category tree with active product counts flattened', async () => {
    prisma.category.findMany.mockResolvedValueOnce([category]);

    await expect(service.listTree()).resolves.toEqual([
      {
        id: 'cat_1',
        name: 'Dresses',
        slug: 'dresses',
        imageUrl: 'https://example.test/dresses.jpg',
        productCount: 4,
        subCategories: [
          { id: 'sub_1', name: 'Evening', slug: 'evening', productCount: 2 },
        ],
      },
    ]);
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it('gets a category by slug with the same public shape', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce(category);

    await expect(service.getBySlug('dresses')).resolves.toMatchObject({
      id: 'cat_1',
      productCount: 4,
      subCategories: [expect.objectContaining({ productCount: 2 })],
    });
    expect(prisma.category.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'dresses' } }),
    );
  });
});
