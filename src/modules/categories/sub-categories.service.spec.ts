import type { PrismaService } from '../../prisma/prisma.service';
import { SubCategoriesService } from './sub-categories.service';

describe('SubCategoriesService', () => {
  const prisma = {
    category: { findUniqueOrThrow: jest.fn() },
    subCategory: {
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    productSubCategory: { count: jest.fn() },
  };
  const service = new SubCategoriesService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('returns an app-level 409 when a sub-category has products', async () => {
    prisma.subCategory.findUniqueOrThrow.mockResolvedValueOnce({ id: 'sub_1' });
    prisma.productSubCategory.count.mockResolvedValueOnce(1);

    await expect(service.removeSubCategory('sub_1')).rejects.toMatchObject({
      response: { code: 'FOREIGN_KEY_CONSTRAINT' },
    });
    expect(prisma.subCategory.delete).not.toHaveBeenCalled();
  });

  it('blocks moving a referenced sub-category to another category', async () => {
    prisma.subCategory.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'sub_1',
      name: 'Dresses',
      categoryId: 'cat_1',
    });
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cat_2' });
    prisma.productSubCategory.count.mockResolvedValueOnce(1);

    await expect(
      service.updateSubCategory('sub_1', { categoryId: 'cat_2' }),
    ).rejects.toMatchObject({
      response: { code: 'FOREIGN_KEY_CONSTRAINT' },
    });
    expect(prisma.subCategory.update).not.toHaveBeenCalled();
  });
});
