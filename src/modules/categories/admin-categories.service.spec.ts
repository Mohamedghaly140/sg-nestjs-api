/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PrismaService } from '../../prisma/prisma.service';
import type { UploadsService } from '../uploads/uploads.service';
import { AdminCategoriesService } from './admin-categories.service';

describe('AdminCategoriesService', () => {
  const prisma = {
    category: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const uploads = { destroyImage: jest.fn() };
  const service = new AdminCategoriesService(
    prisma as unknown as PrismaService,
    uploads as unknown as UploadsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('destroys a replaced image only after the DB update succeeds', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cat_1',
      name: 'Dresses',
      imageId: 'old-image',
    });
    prisma.category.update.mockResolvedValueOnce({ id: 'cat_1' });

    await expect(
      service.updateCategory('cat_1', {
        imageId: 'new-image',
        imageUrl: 'https://example.test/new.jpg',
      }),
    ).resolves.toEqual({ id: 'cat_1' });
    expect(prisma.category.update).toHaveBeenCalled();
    expect(uploads.destroyImage).toHaveBeenCalledWith('old-image');
  });

  it('does not fail the update when image destruction fails', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cat_1',
      name: 'Dresses',
      imageId: 'old-image',
    });
    prisma.category.update.mockResolvedValueOnce({ id: 'cat_1' });
    uploads.destroyImage.mockResolvedValueOnce(undefined);

    await expect(
      service.updateCategory('cat_1', { imageId: 'new-image' }),
    ).resolves.toEqual({ id: 'cat_1' });
  });

  it('lists categories with a search filter and pagination meta', async () => {
    prisma.category.findMany.mockResolvedValueOnce([{ id: 'cat_1' }]);
    prisma.category.count.mockResolvedValueOnce(1);

    await expect(
      service.listCategories({ page: 1, limit: 20, search: 'dress' }),
    ).resolves.toMatchObject({
      data: [{ id: 'cat_1' }],
      meta: { page: 1, limit: 20, totalItems: 1 },
    });
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'dress', mode: 'insensitive' } },
            { slug: { contains: 'dress', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('creates a category with a de-duplicated slug', async () => {
    prisma.category.findMany.mockResolvedValueOnce([{ slug: 'dresses' }]);
    prisma.category.create.mockResolvedValueOnce({ id: 'cat_2' });

    await expect(
      service.createCategory({
        name: 'Dresses',
        imageId: 'img_1',
        imageUrl: 'https://example.test/dresses.jpg',
      }),
    ).resolves.toEqual({ id: 'cat_2' });
    expect(prisma.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'dresses-2' }),
      }),
    );
  });

  it('renames a category, resolving a new slug excluding itself', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'cat_1',
      name: 'Dresses',
      imageId: 'img_1',
    });
    prisma.category.findMany.mockResolvedValueOnce([]);
    prisma.category.update.mockResolvedValueOnce({ id: 'cat_1' });

    await service.updateCategory('cat_1', { name: 'Gowns' });

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'cat_1' } }),
      }),
    );
    expect(prisma.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Gowns', slug: 'gowns' },
      }),
    );
    expect(uploads.destroyImage).toHaveBeenCalledWith(null);
  });

  it('removes a category and destroys its image afterwards', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({
      imageId: 'img_1',
    });
    prisma.category.delete.mockResolvedValueOnce({});

    await service.removeCategory('cat_1');

    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: 'cat_1' },
    });
    expect(uploads.destroyImage).toHaveBeenCalledWith('img_1');
  });
});
