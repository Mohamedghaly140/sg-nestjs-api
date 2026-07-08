/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import type { UploadsService } from '../uploads/uploads.service';
import { ManageProductsService } from './manage-products.service';

describe('ManageProductsService', () => {
  const prisma = {
    category: { findUniqueOrThrow: jest.fn() },
    subCategory: { count: jest.fn() },
    product: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    productSubCategory: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    productImage: {
      deleteMany: jest.fn(),
      update: jest.fn(),
      createMany: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirstOrThrow: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg as []),
    ),
  };
  const uploads = {
    destroyImage: jest.fn(),
    destroyImages: jest.fn(),
  };
  const service = new ManageProductsService(
    prisma,
    uploads as unknown as UploadsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects sub-categories outside the selected category', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cat_1' });
    prisma.subCategory.count.mockResolvedValueOnce(1);

    await expect(
      service.createProduct({
        name: 'Dress',
        description: 'Desc',
        quantity: 1,
        price: 100,
        sizes: [],
        colors: [],
        imageId: 'cover',
        imageUrl: 'https://example.test/cover.jpg',
        categoryId: 'cat_1',
        subCategoryIds: ['sub_1', 'sub_2'],
      }),
    ).rejects.toMatchObject({
      response: { code: 'SUBCATEGORY_CATEGORY_MISMATCH' },
    });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('diffs gallery images by Cloudinary imageId and destroys removed assets', async () => {
    prisma.product.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'prod_1',
        name: 'Dress',
        categoryId: 'cat_1',
        price: new Prisma.Decimal(100),
        discount: new Prisma.Decimal(0),
        imageId: 'old-cover',
        images: [
          { id: 'img_keep', imageId: 'keep', imageUrl: 'old', sortOrder: 0 },
          {
            id: 'img_remove',
            imageId: 'remove',
            imageUrl: 'old',
            sortOrder: 1,
          },
          { id: 'img_null', imageId: null, imageUrl: null, sortOrder: 2 },
        ],
        subCategories: [],
      })
      .mockResolvedValueOnce({ id: 'prod_1', subCategories: [] });
    prisma.product.update.mockResolvedValue({});

    await service.updateProduct('prod_1', {
      imageId: 'new-cover',
      images: [
        {
          imageId: 'keep',
          imageUrl: 'https://example.test/keep-new.jpg',
          sortOrder: 2,
        },
        {
          imageId: 'new',
          imageUrl: 'https://example.test/new.jpg',
          sortOrder: 3,
        },
      ],
    });

    expect(prisma.productImage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['img_remove', 'img_null'] }, productId: 'prod_1' },
    });
    expect(prisma.productImage.update).toHaveBeenCalledWith({
      where: { id: 'img_keep' },
      data: { imageUrl: 'https://example.test/keep-new.jpg', sortOrder: 2 },
    });
    expect(prisma.productImage.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: 'prod_1',
          imageId: 'new',
          imageUrl: 'https://example.test/new.jpg',
          sortOrder: 3,
        },
      ],
    });
    expect(uploads.destroyImages).toHaveBeenCalledWith([
      'old-cover',
      'remove',
      null,
    ]);
  });

  it('archives referenced products instead of deleting them', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'prod_1',
      imageId: 'cover',
      images: [],
      _count: { cartItems: 1, orderItems: 0 },
    });
    prisma.product.update.mockResolvedValueOnce({ id: 'prod_1' });

    await expect(service.removeProduct('prod_1')).resolves.toEqual({
      deleted: false,
      archived: true,
    });
    expect(prisma.product.delete).not.toHaveBeenCalled();
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { status: ProductStatus.ARCHIVED, featured: false },
      select: { id: true },
    });
  });

  it('falls back to archive when hard delete races with a new reference', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'prod_1',
      imageId: 'cover',
      images: [],
      _count: { cartItems: 0, orderItems: 0 },
    });
    prisma.product.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );
    prisma.product.update.mockResolvedValueOnce({ id: 'prod_1' });

    await expect(service.removeProduct('prod_1')).resolves.toEqual({
      deleted: false,
      archived: true,
    });
  });

  it('duplicates products as drafts with blank images and de-duped copy slugs', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      name: 'Dress',
      slug: 'dress',
      description: 'Desc',
      quantity: 3,
      price: new Prisma.Decimal(100),
      discount: new Prisma.Decimal(10),
      priceAfterDiscount: new Prisma.Decimal(90),
      sizes: ['S'],
      colors: ['Black'],
      categoryId: 'cat_1',
      subCategories: [{ subCategoryId: 'sub_1' }],
    });
    prisma.product.findMany.mockResolvedValueOnce([
      { slug: 'dress-copy' },
      { slug: 'dress-copy-2' },
    ]);
    prisma.product.create.mockResolvedValueOnce({
      id: 'copy',
      subCategories: [],
    });

    await service.duplicateProduct('prod_1');

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Dress (copy)',
          slug: 'dress-copy-3',
          status: ProductStatus.DRAFT,
          featured: false,
          imageId: '',
          imageUrl: '',
          sold: 0,
          ratingsAverage: null,
          ratingsQuantity: 0,
        }),
      }),
    );
  });
});
