/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/products/:id/reviews and /reviews/:id (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let categoryId: string;
  let activeProductId: string;
  let draftProductId: string;

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
    await prisma.review.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-review-' } } },
    });
    await prisma.userWishlist.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-review-' } } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-review-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: 'e2e-review-cat' },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Review Cat', slug: 'e2e-review-cat' },
    });
    categoryId = category.id;

    const activeProduct = await prisma.product.create({
      data: {
        name: 'E2E Review Active',
        slug: 'e2e-review-active',
        description: 'Review product',
        quantity: 5,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: ['S'],
        colors: ['Black'],
        imageId: 'e2e/review/active',
        imageUrl: 'https://example.test/review-active.jpg',
        status: ProductStatus.ACTIVE,
        categoryId,
      },
    });
    activeProductId = activeProduct.id;

    const draftProduct = await prisma.product.create({
      data: {
        name: 'E2E Review Draft',
        slug: 'e2e-review-draft',
        description: 'Draft review product',
        quantity: 5,
        price: '100.00',
        discount: '0.00',
        priceAfterDiscount: '100.00',
        sizes: [],
        colors: [],
        imageId: 'e2e/review/draft',
        imageUrl: 'https://example.test/review-draft.jpg',
        status: ProductStatus.DRAFT,
        categoryId,
      },
    });
    draftProductId = draftProduct.id;
  }

  async function createCustomerReview(ratings = 4) {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/products/${activeProductId}/reviews`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ title: 'Loved it', ratings })
      .expect(201);

    return response.body.data as { id: string };
  }

  it('lists reviews publicly and creates one review per user', async () => {
    await createCustomerReview(4.5);

    await request(app.getHttpServer())
      .get(`/api/v1/products/${activeProductId}/reviews`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
        expect(body.data[0]).toMatchObject({
          title: 'Loved it',
          ratings: '4.5',
          user: { id: 'user_seed_customer' },
        });
        expect(body.meta).toMatchObject({ page: 1, totalItems: 1 });
      });

    await request(app.getHttpServer())
      .post(`/api/v1/products/${activeProductId}/reviews`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ ratings: 5 })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('REVIEW_EXISTS'));
  });

  it('defaults an omitted create-review title to an empty string', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${activeProductId}/reviews`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ ratings: 4 })
      .expect(201)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          title: '',
          ratings: '4',
        });
      });
  });

  it('rejects reviews for non-ACTIVE products', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/products/${draftProductId}/reviews`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ ratings: 4 })
      .expect(404);
  });

  it('allows editing only by the review owner', async () => {
    const review = await createCustomerReview(4);

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${review.id}`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ title: 'Still loved it', ratings: 3.5 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          title: 'Still loved it',
          ratings: '3.5',
        });
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${review.id}`)
      .set(authHeader(TEST_TOKENS.admin))
      .send({ ratings: 5 })
      .expect(403);
  });

  it('rejects null review patch fields with the validation envelope', async () => {
    const review = await createCustomerReview(4);

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${review.id}`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ title: null })
      .expect(422)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        });
        expect(body.errors).toEqual(
          expect.arrayContaining([expect.objectContaining({ field: 'title' })]),
        );
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${review.id}`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ ratings: null })
      .expect(422)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        });
        expect(body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'ratings' }),
          ]),
        );
      });
  });

  it('allows owner delete and ADMIN moderation delete', async () => {
    const ownReview = await createCustomerReview(4);

    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${ownReview.id}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(204);

    const otherReview = await createCustomerReview(4);
    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${otherReview.id}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(204);
  });

  it('keeps product rating aggregates correct across create, update, and delete', async () => {
    const customerReview = await createCustomerReview(4);
    const adminReviewResponse = await request(app.getHttpServer())
      .post(`/api/v1/products/${activeProductId}/reviews`)
      .set(authHeader(TEST_TOKENS.admin))
      .send({ title: 'Admin review', ratings: 5 })
      .expect(201);
    const adminReview = adminReviewResponse.body.data as { id: string };

    await expectProductRatings('4.5', 2);

    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${customerReview.id}`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ ratings: 3 })
      .expect(200);

    await expectProductRatings('4', 2);

    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${adminReview.id}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(204);

    await expectProductRatings('3', 1);

    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${customerReview.id}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(204);

    await expectProductRatings(null, 0);
  });

  it('requires authentication for mutating review routes', async () => {
    const review = await createCustomerReview(4);

    await request(app.getHttpServer())
      .post(`/api/v1/products/${activeProductId}/reviews`)
      .send({ ratings: 5 })
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/v1/reviews/${review.id}`)
      .send({ ratings: 5 })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/api/v1/reviews/${review.id}`)
      .expect(401);
  });

  async function expectProductRatings(
    ratingsAverage: string | null,
    ratingsQuantity: number,
  ) {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: activeProductId },
      select: { ratingsAverage: true, ratingsQuantity: true },
    });
    expect(product.ratingsAverage?.toString() ?? null).toBe(ratingsAverage);
    expect(product.ratingsQuantity).toBe(ratingsQuantity);
  }
});
