/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/wishlist (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let activeProductId: string;
  let archivedProductId: string;

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
    await prisma.userWishlist.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-wishlist-' } } },
    });
    await prisma.review.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-wishlist-' } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-wishlist-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: 'e2e-wishlist-cat' },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Wishlist Cat', slug: 'e2e-wishlist-cat' },
    });
    categoryId = category.id;

    const activeProduct = await prisma.product.create({
      data: {
        name: 'E2E Wishlist Active',
        slug: 'e2e-wishlist-active',
        description: 'Active wishlist product',
        quantity: 4,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: ['S'],
        colors: ['Black'],
        imageId: 'e2e/wishlist/active',
        imageUrl: 'https://example.test/wishlist-active.jpg',
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    activeProductId = activeProduct.id;

    const archivedProduct = await prisma.product.create({
      data: {
        name: 'E2E Wishlist Archived',
        slug: 'e2e-wishlist-archived',
        description: 'Archived wishlist product',
        quantity: 4,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: [],
        colors: [],
        imageId: 'e2e/wishlist/archived',
        imageUrl: 'https://example.test/wishlist-archived.jpg',
        status: ProductStatus.ARCHIVED,
        categoryId,
      },
    });
    archivedProductId = archivedProduct.id;
  }

  it('adds, re-adds, lists, removes, and re-removes wishlist products idempotently', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/wishlist/${activeProductId}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ added: true }));

    const firstRow = await prisma.userWishlist.findUniqueOrThrow({
      where: {
        userId_productId: {
          userId: 'user_seed_customer',
          productId: activeProductId,
        },
      },
    });

    await request(app.getHttpServer())
      .put(`/api/v1/wishlist/${activeProductId}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200)
      .expect(({ body }) => expect(body.data).toEqual({ added: true }));

    const secondRow = await prisma.userWishlist.findUniqueOrThrow({
      where: {
        userId_productId: {
          userId: 'user_seed_customer',
          productId: activeProductId,
        },
      },
    });
    expect(secondRow.addedAt.toISOString()).toBe(
      firstRow.addedAt.toISOString(),
    );

    await prisma.userWishlist.create({
      data: {
        userId: 'user_seed_customer',
        productId: archivedProductId,
      },
    });

    await request(app.getHttpServer())
      .get('/api/v1/wishlist')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              available: true,
              product: expect.objectContaining({ id: activeProductId }),
            }),
            expect.objectContaining({
              available: false,
              product: expect.objectContaining({ id: archivedProductId }),
            }),
          ]),
        );
        expect(body.data[0].product.status).toBeUndefined();
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/wishlist/${activeProductId}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/wishlist/${activeProductId}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(204);
  });

  it('returns 404 when adding a missing product', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/wishlist/missing_product')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(404);
  });

  it('requires authentication for all wishlist routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/wishlist').expect(401);
    await request(app.getHttpServer())
      .put(`/api/v1/wishlist/${activeProductId}`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/v1/wishlist/${activeProductId}`)
      .expect(401);
  });
});
