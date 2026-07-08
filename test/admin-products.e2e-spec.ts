/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';
import type { createFakeCloudinaryClient } from './support/cloudinary-test-utils';

describe('/admin/products and product management (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cloudinary: ReturnType<typeof createFakeCloudinaryClient>;
  let categoryId: string;
  let otherCategoryId: string;
  let subCategoryId: string;
  let otherSubCategoryId: string;

  beforeAll(async () => {
    ({ app, prisma, cloudinary } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.cartItem.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-admin-product-' } } },
    });
    await prisma.cart.deleteMany({
      where: { sessionToken: { startsWith: 'e2e-admin-product-' } },
    });
    await prisma.productSubCategory.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-admin-product-' } } },
    });
    await prisma.productImage.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-admin-product-' } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-admin-product-' } },
    });
    await prisma.subCategory.deleteMany({
      where: { slug: { startsWith: 'e2e-admin-product-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: 'e2e-admin-product-' } },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Admin Product Cat', slug: 'e2e-admin-product-cat' },
    });
    categoryId = category.id;
    const otherCategory = await prisma.category.create({
      data: {
        name: 'E2E Admin Product Other Cat',
        slug: 'e2e-admin-product-other-cat',
      },
    });
    otherCategoryId = otherCategory.id;
    const subCategory = await prisma.subCategory.create({
      data: {
        name: 'E2E Admin Product Sub',
        slug: 'e2e-admin-product-sub',
        categoryId,
      },
    });
    subCategoryId = subCategory.id;
    const otherSubCategory = await prisma.subCategory.create({
      data: {
        name: 'E2E Admin Product Other Sub',
        slug: 'e2e-admin-product-other-sub',
        categoryId: otherCategoryId,
      },
    });
    otherSubCategoryId = otherSubCategory.id;
  }

  async function createProduct(name = 'E2E Admin Product Base') {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name,
        description: 'Admin product description',
        quantity: 6,
        price: 19.99,
        discount: 35,
        sizes: ['S', 'M'],
        colors: ['Black'],
        imageId: 'e2e-admin-product/cover',
        imageUrl: 'https://example.test/cover.jpg',
        status: ProductStatus.ACTIVE,
        featured: true,
        categoryId,
        subCategoryIds: [subCategoryId],
      })
      .expect(201);
    return response.body.data as { id: string; slug: string };
  }

  it('lists all statuses and exposes form/filter reference data', async () => {
    await createProduct();
    await prisma.product.create({
      data: {
        name: 'E2E Admin Product Draft',
        slug: 'e2e-admin-product-draft',
        description: 'Draft',
        quantity: 1,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: [],
        colors: [],
        imageId: 'e2e/draft',
        imageUrl: 'https://example.test/draft.jpg',
        status: ProductStatus.DRAFT,
        categoryId,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/products?search=e2e-admin-product')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        const statuses = body.data.map(
          (item: { status: ProductStatus }) => item.status,
        );
        expect(statuses).toEqual(
          expect.arrayContaining([ProductStatus.ACTIVE, ProductStatus.DRAFT]),
        );
      });

    await request(app.getHttpServer())
      .get('/api/v1/admin/products/filter-options')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.data.categories.some(
            (item: { id: string }) => item.id === categoryId,
          ),
        ).toBe(true),
      );

    await request(app.getHttpServer())
      .get('/api/v1/admin/products/form-data')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.data.subCategories.some(
            (item: { id: string }) => item.id === subCategoryId,
          ),
        ).toBe(true),
      );
  });

  it('creates products with computed price and validates semantic errors', async () => {
    const product = await createProduct();
    expect(product.slug).toBe('e2e-admin-product-base');

    await request(app.getHttpServer())
      .get(`/api/v1/admin/products/${product.id}/form`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.priceAfterDiscount).toBe('12.99');
        expect(body.data.subCategoryIds).toEqual([subCategoryId]);
      });

    await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name: 'E2E Admin Product Invalid Discount',
        description: 'Invalid',
        quantity: 1,
        price: 100,
        discount: 71,
        sizes: [],
        colors: [],
        imageId: 'e2e/invalid',
        imageUrl: 'https://example.test/invalid.jpg',
        categoryId,
      })
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name: 'E2E Admin Product Mismatch',
        description: 'Mismatch',
        quantity: 1,
        price: 100,
        sizes: [],
        colors: [],
        imageId: 'e2e/mismatch',
        imageUrl: 'https://example.test/mismatch.jpg',
        categoryId,
        subCategoryIds: [otherSubCategoryId],
      })
      .expect(422)
      .expect(({ body }) =>
        expect(body.code).toBe('SUBCATEGORY_CATEGORY_MISMATCH'),
      );
  });

  it('diffs gallery updates and destroys removed Cloudinary IDs', async () => {
    const product = await createProduct();
    await prisma.productImage.createMany({
      data: [
        {
          productId: product.id,
          imageId: 'gallery/keep',
          imageUrl: 'https://example.test/keep-old.jpg',
          sortOrder: 0,
        },
        {
          productId: product.id,
          imageId: 'gallery/remove',
          imageUrl: 'https://example.test/remove.jpg',
          sortOrder: 1,
        },
      ],
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${product.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        imageId: 'e2e-admin-product/new-cover',
        imageUrl: 'https://example.test/new-cover.jpg',
        images: [
          {
            imageId: 'gallery/keep',
            imageUrl: 'https://example.test/keep-new.jpg',
            sortOrder: 3,
          },
          {
            imageId: 'gallery/new',
            imageUrl: 'https://example.test/new.jpg',
            sortOrder: 4,
          },
        ],
      })
      .expect(200);

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      'e2e-admin-product/cover',
    );
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('gallery/remove');
  });

  it('archives referenced products and duplicates with de-duped draft slugs', async () => {
    const product = await createProduct();
    const cart = await prisma.cart.create({
      data: { sessionToken: 'e2e-admin-product-cart' },
    });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: product.id,
        quantity: 1,
        price: '12.99',
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/products/${product.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) =>
        expect(body.data).toEqual({ deleted: false, archived: true }),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.id}/duplicate`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          slug: 'e2e-admin-product-base-copy',
          status: ProductStatus.DRAFT,
          featured: false,
          imageId: '',
          imageUrl: '',
        });
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.id}/duplicate`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(201)
      .expect(({ body }) =>
        expect(body.data.slug).toBe('e2e-admin-product-base-copy-2'),
      );
  });

  it('adds, removes, and reorders gallery images with scoped 404s', async () => {
    const product = await createProduct();
    const other = await createProduct('E2E Admin Product Other');

    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.id}/images`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        imageId: 'gallery/first',
        imageUrl: 'https://example.test/first.jpg',
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${product.id}/images`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        imageId: 'gallery/second',
        imageUrl: 'https://example.test/second.jpg',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${product.id}/images/reorder`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ order: [second.body.data.id, first.body.data.id] })
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.map((image: { id: string }) => image.id)).toEqual([
          second.body.data.id,
          first.body.data.id,
        ]),
      );

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${product.id}/images/reorder`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ order: [first.body.data.id] })
      .expect(422);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/products/${other.id}/images/${first.body.data.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(404);

    await request(app.getHttpServer())
      .delete(
        `/api/v1/admin/products/${product.id}/images/${first.body.data.id}`,
      )
      .set(authHeader(TEST_TOKENS.manager))
      .expect(204);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('gallery/first');
  });
});
