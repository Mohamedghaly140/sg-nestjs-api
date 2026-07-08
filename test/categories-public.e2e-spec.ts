/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/categories public catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let subCategoryId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    await resetFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.productSubCategory.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-pubcat-' } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-pubcat-' } },
    });
    await prisma.subCategory.deleteMany({
      where: { slug: { startsWith: 'e2e-pubcat-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: 'e2e-pubcat-' } },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: {
        name: 'E2E Pubcat Dresses',
        slug: 'e2e-pubcat-dresses',
        imageUrl: 'https://example.test/category.jpg',
      },
    });
    categoryId = category.id;
    const subCategory = await prisma.subCategory.create({
      data: {
        name: 'E2E Pubcat Evening',
        slug: 'e2e-pubcat-evening',
        categoryId,
      },
    });
    subCategoryId = subCategory.id;
    const active = await prisma.product.create({
      data: {
        name: 'E2E Pubcat Active',
        slug: 'e2e-pubcat-active',
        description: 'Active product',
        quantity: 5,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: ['S'],
        colors: ['Black'],
        imageId: 'e2e/active',
        imageUrl: 'https://example.test/active.jpg',
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    await prisma.productSubCategory.create({
      data: { productId: active.id, subCategoryId },
    });
    await prisma.product.create({
      data: {
        name: 'E2E Pubcat Draft',
        slug: 'e2e-pubcat-draft',
        description: 'Draft product',
        quantity: 5,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: ['S'],
        colors: ['Black'],
        imageId: 'e2e/draft',
        imageUrl: 'https://example.test/draft.jpg',
        status: ProductStatus.DRAFT,
        categoryId,
      },
    });
  }

  it('returns a tree with ACTIVE-only product counts', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/categories')
      .expect(200)
      .expect(({ body }) => {
        const category = body.data.find(
          (item: { slug: string }) => item.slug === 'e2e-pubcat-dresses',
        );
        expect(category).toMatchObject({
          productCount: 1,
          subCategories: [
            expect.objectContaining({
              slug: 'e2e-pubcat-evening',
              productCount: 1,
            }),
          ],
        });
      });
  });

  it('returns category detail by slug and 404 for unknown slugs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/categories/e2e-pubcat-dresses')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          id: categoryId,
          slug: 'e2e-pubcat-dresses',
          productCount: 1,
        });
      });

    await request(app.getHttpServer())
      .get('/api/v1/categories/not-found')
      .expect(404);
  });
});
