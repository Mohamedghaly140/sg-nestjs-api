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

  it('creates a product with computed discount price, default draft status, and flattened joins', async () => {
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cat_1' });
    prisma.subCategory.count.mockResolvedValueOnce(1);
    prisma.product.findMany.mockResolvedValueOnce([]);
    prisma.product.create.mockResolvedValueOnce({
      id: 'prod_1',
      subCategories: [
        { subCategory: { id: 'sub_1', name: 'Evening', slug: 'evening' } },
      ],
    });

    await expect(
      service.createProduct({
        name: 'Dress',
        description: 'Desc',
        quantity: 3,
        price: 100,
        discount: 10,
        sizes: ['M'],
        colors: ['Black'],
        imageId: 'cover',
        imageUrl: 'https://example.test/cover.jpg',
        categoryId: 'cat_1',
        subCategoryIds: ['sub_1'],
      }),
    ).resolves.toMatchObject({
      id: 'prod_1',
      subCategories: [{ id: 'sub_1', name: 'Evening', slug: 'evening' }],
    });

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'dress',
          discount: 10,
          status: ProductStatus.DRAFT,
          featured: false,
          subCategories: {
            create: [{ subCategory: { connect: { id: 'sub_1' } } }],
          },
        }),
      }),
    );
  });

  it('rejects a category change that would orphan existing sub-category joins', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'prod_1',
      name: 'Dress',
      categoryId: 'cat_1',
      price: new Prisma.Decimal(100),
      discount: new Prisma.Decimal(0),
      imageId: 'cover',
      images: [],
      subCategories: [{ subCategory: { id: 'sub_1', categoryId: 'cat_1' } }],
    });
    prisma.category.findUniqueOrThrow.mockResolvedValueOnce({ id: 'cat_2' });

    await expect(
      service.updateProduct('prod_1', { categoryId: 'cat_2' }),
    ).rejects.toMatchObject({
      response: { code: 'SUBCATEGORY_CATEGORY_MISMATCH' },
    });
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('replaces sub-category joins when subCategoryIds are provided', async () => {
    prisma.product.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'prod_1',
        name: 'Dress',
        categoryId: 'cat_1',
        price: new Prisma.Decimal(100),
        discount: new Prisma.Decimal(0),
        imageId: 'cover',
        images: [],
        subCategories: [],
      })
      .mockResolvedValueOnce({ id: 'prod_1', subCategories: [] });
    prisma.subCategory.count.mockResolvedValueOnce(1);
    prisma.product.update.mockResolvedValueOnce({});

    await service.updateProduct('prod_1', { subCategoryIds: ['sub_1'] });

    expect(prisma.productSubCategory.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'prod_1' },
    });
    expect(prisma.productSubCategory.createMany).toHaveBeenCalledWith({
      data: [{ productId: 'prod_1', subCategoryId: 'sub_1' }],
    });
  });

  it('hard-deletes unreferenced products and destroys all their images', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'prod_1',
      imageId: 'cover',
      images: [{ imageId: 'gallery_1' }],
      _count: { cartItems: 0, orderItems: 0 },
    });
    prisma.product.delete.mockResolvedValueOnce({});

    await expect(service.removeProduct('prod_1')).resolves.toEqual({
      deleted: true,
      archived: false,
    });
    expect(uploads.destroyImages).toHaveBeenCalledWith(['cover', 'gallery_1']);
  });

  it('rethrows non-FK errors from the hard delete', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'prod_1',
      imageId: 'cover',
      images: [],
      _count: { cartItems: 0, orderItems: 0 },
    });
    prisma.product.delete.mockRejectedValueOnce(new Error('db down'));

    await expect(service.removeProduct('prod_1')).rejects.toThrow('db down');
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('sets featured and status through narrow updates', async () => {
    prisma.product.update
      .mockResolvedValueOnce({ id: 'prod_1', featured: true })
      .mockResolvedValueOnce({ id: 'prod_1', status: ProductStatus.ACTIVE });

    await expect(
      service.setFeatured('prod_1', { featured: true }),
    ).resolves.toEqual({ id: 'prod_1', featured: true });
    await expect(
      service.setStatus('prod_1', { status: ProductStatus.ACTIVE }),
    ).resolves.toEqual({ id: 'prod_1', status: ProductStatus.ACTIVE });
  });

  it('appends a gallery image after the current max sort order', async () => {
    prisma.product.findUniqueOrThrow.mockResolvedValueOnce({ id: 'prod_1' });
    prisma.productImage.aggregate.mockResolvedValueOnce({
      _max: { sortOrder: 2 },
    });
    prisma.productImage.create.mockResolvedValueOnce({ id: 'img_new' });

    await service.addImage('prod_1', {
      imageId: 'cloud_new',
      imageUrl: 'https://example.test/new.jpg',
    });

    expect(prisma.productImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 3 }),
      }),
    );
  });

  it('removes a gallery image and destroys its Cloudinary asset', async () => {
    prisma.productImage.findFirstOrThrow.mockResolvedValueOnce({
      id: 'img_1',
      imageId: 'cloud_1',
    });
    prisma.productImage.delete.mockResolvedValueOnce({});

    await service.removeImage('prod_1', 'img_1');

    expect(prisma.productImage.delete).toHaveBeenCalledWith({
      where: { id: 'img_1' },
    });
    expect(uploads.destroyImage).toHaveBeenCalledWith('cloud_1');
  });

  it('reorders gallery images only for an exact permutation', async () => {
    prisma.productImage.findMany
      .mockResolvedValueOnce([{ id: 'img_a' }, { id: 'img_b' }])
      .mockResolvedValueOnce([{ id: 'img_b' }, { id: 'img_a' }]);

    await expect(
      service.reorderImages('prod_1', ['img_b', 'img_a']),
    ).resolves.toEqual([{ id: 'img_b' }, { id: 'img_a' }]);
    expect(prisma.productImage.update).toHaveBeenCalledWith({
      where: { id: 'img_b' },
      data: { sortOrder: 0 },
    });

    prisma.productImage.findMany.mockResolvedValueOnce([
      { id: 'img_a' },
      { id: 'img_b' },
    ]);
    await expect(
      service.reorderImages('prod_1', ['img_a']),
    ).rejects.toMatchObject({ response: { code: 'INVALID_VARIANT' } });
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
