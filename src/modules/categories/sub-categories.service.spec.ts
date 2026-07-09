/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

  it('creates a sub-category under an existing parent with a unique slug', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cat_1' });
    prisma.subCategory.findMany.mockResolvedValueOnce([{ slug: 'evening' }]);
    prisma.subCategory.create.mockResolvedValueOnce({ id: 'sub_2' });

    await expect(
      service.createSubCategory({ name: 'Evening', categoryId: 'cat_1' }),
    ).resolves.toEqual({ id: 'sub_2' });
    expect(prisma.subCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Evening', slug: 'evening-2', categoryId: 'cat_1' },
      }),
    );
  });

  it('renames a sub-category, resolving a fresh slug excluding itself', async () => {
    prisma.subCategory.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'sub_1',
      name: 'Evening',
      categoryId: 'cat_1',
    });
    prisma.subCategory.findMany.mockResolvedValueOnce([]);
    prisma.subCategory.update.mockResolvedValueOnce({ id: 'sub_1' });

    await service.updateSubCategory('sub_1', { name: 'Cocktail' });

    expect(prisma.subCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'sub_1' } }),
      }),
    );
    expect(prisma.subCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Cocktail', slug: 'cocktail' },
      }),
    );
    expect(prisma.productSubCategory.count).not.toHaveBeenCalled();
  });

  it('allows moving an unreferenced sub-category to another category', async () => {
    prisma.subCategory.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'sub_1',
      name: 'Evening',
      categoryId: 'cat_1',
    });
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cat_2' });
    prisma.productSubCategory.count.mockResolvedValueOnce(0);
    prisma.subCategory.update.mockResolvedValueOnce({ id: 'sub_1' });

    await service.updateSubCategory('sub_1', { categoryId: 'cat_2' });

    expect(prisma.subCategory.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { categoryId: 'cat_2' } }),
    );
  });

  it('removes an unreferenced sub-category', async () => {
    prisma.subCategory.findUniqueOrThrow.mockResolvedValueOnce({ id: 'sub_1' });
    prisma.productSubCategory.count.mockResolvedValueOnce(0);
    prisma.subCategory.delete.mockResolvedValueOnce({});

    await service.removeSubCategory('sub_1');

    expect(prisma.subCategory.delete).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
    });
  });
});
