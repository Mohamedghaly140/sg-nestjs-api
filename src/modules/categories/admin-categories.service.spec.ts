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
});
