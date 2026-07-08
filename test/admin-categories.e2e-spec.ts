/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';
import type { createFakeCloudinaryClient } from './support/cloudinary-test-utils';

describe('/admin/categories and /sub-categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cloudinary: ReturnType<typeof createFakeCloudinaryClient>;

  beforeAll(async () => {
    ({ app, prisma, cloudinary } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.productSubCategory.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-admin-cat-' } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-admin-cat-' } },
    });
    await prisma.subCategory.deleteMany({
      where: { slug: { startsWith: 'e2e-admin-cat-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: 'e2e-admin-cat-' } },
    });
  }

  it('enforces Manager+ role on category writes', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ name: 'E2E Admin Cat Blocked' })
      .expect(403);
  });

  it('creates categories with de-duplicated slugs and lists them for admin', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set(authHeader(TEST_TOKENS.manager))
      .send({ name: 'E2E Admin Cat One' })
      .expect(201);
    // Category.name is unique — use a different name that slugifies the same.
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set(authHeader(TEST_TOKENS.manager))
      .send({ name: 'E2E Admin Cat: One' })
      .expect(201);

    expect(first.body.data.slug).toBe('e2e-admin-cat-one');
    expect(second.body.data.slug).toBe('e2e-admin-cat-one-2');

    await request(app.getHttpServer())
      .get('/api/v1/admin/categories?search=e2e-admin-cat-one')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.length).toBeGreaterThanOrEqual(2);
        expect(body.meta.totalItems).toBeGreaterThanOrEqual(2);
      });
  });

  it('destroys old category image on replace and deletes empty categories', async () => {
    const category = await prisma.category.create({
      data: {
        name: 'E2E Admin Cat Image',
        slug: 'e2e-admin-cat-image',
        imageId: 'old-image',
        imageUrl: 'https://example.test/old.jpg',
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${category.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        imageId: 'new-image',
        imageUrl: 'https://example.test/new.jpg',
      })
      .expect(200);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('old-image');

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${category.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(204);
  });

  it('returns 409 when deleting categories or sub-categories with products', async () => {
    const category = await prisma.category.create({
      data: { name: 'E2E Admin Cat Used', slug: 'e2e-admin-cat-used' },
    });
    const subCategory = await prisma.subCategory.create({
      data: {
        name: 'E2E Admin Cat Used Sub',
        slug: 'e2e-admin-cat-used-sub',
        categoryId: category.id,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: 'E2E Admin Cat Product',
        slug: 'e2e-admin-cat-product',
        description: 'Product',
        quantity: 1,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: [],
        colors: [],
        imageId: 'e2e/product',
        imageUrl: 'https://example.test/product.jpg',
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    await prisma.productSubCategory.create({
      data: { productId: product.id, subCategoryId: subCategory.id },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/sub-categories/${subCategory.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('FOREIGN_KEY_CONSTRAINT'));

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${category.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(409);
  });
});
