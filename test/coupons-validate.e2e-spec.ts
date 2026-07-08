/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ProductStatus } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/coupons/validate (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let productId: string;

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
    await prisma.couponUsage.deleteMany({
      where: { coupon: { name: { startsWith: 'E2E_COUPON_' } } },
    });
    await prisma.coupon.deleteMany({
      where: { name: { startsWith: 'E2E_COUPON_' } },
    });
    await prisma.cartItem.deleteMany({
      where: { product: { slug: { startsWith: 'e2e-coupons-' } } },
    });
    await prisma.cart.deleteMany({
      where: {
        OR: [
          { userId: 'user_seed_customer' },
          { sessionToken: { startsWith: 'e2e-coupons-' } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: 'e2e-coupons-' } },
    });
    await prisma.category.deleteMany({
      where: { slug: 'e2e-coupons-cat' },
    });
  }

  async function resetFixtures() {
    await cleanup();
    const category = await prisma.category.create({
      data: { name: 'E2E Coupons Cat', slug: 'e2e-coupons-cat' },
    });
    const product = await prisma.product.create({
      data: {
        name: 'E2E Coupons Dress',
        slug: 'e2e-coupons-dress',
        description: 'Coupon preview product',
        quantity: 10,
        price: '100.00',
        discount: '10.00',
        priceAfterDiscount: '90.00',
        sizes: ['M'],
        colors: ['Black'],
        imageId: 'e2e/coupons/dress',
        imageUrl: 'https://example.test/coupons-dress.jpg',
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    productId = product.id;
  }

  async function createCoupon(name: string, overrides = {}) {
    return prisma.coupon.create({
      data: {
        name,
        discount: '20.00',
        maxUsage: 10,
        perUserLimit: 1,
        expire: new Date(Date.now() + 86_400_000),
        ...overrides,
      },
    });
  }

  async function seedCart(identity: {
    userId?: string;
    sessionToken?: string;
  }) {
    await prisma.cart.create({
      data: {
        ...identity,
        expiresAt: identity.sessionToken
          ? new Date(Date.now() + 86_400_000)
          : undefined,
        totalCartPrice: '100.00',
        totalPriceAfterDiscount: '90.00',
        items: {
          create: {
            productId,
            quantity: 1,
            color: 'Black',
            size: 'M',
            price: '90.00',
          },
        },
      },
    });
  }

  it('validates for authenticated and guest identities', async () => {
    await createCoupon('E2E_COUPON_SAVE');
    await seedCart({ userId: 'user_seed_customer' });

    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ code: 'e2e_coupon_save' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          valid: true,
          code: 'E2E_COUPON_SAVE',
          discountPercent: '20.00',
          discountApplied: '18.00',
          itemsSubtotal: '90.00',
        });
      });

    await prisma.cart.deleteMany({ where: { userId: 'user_seed_customer' } });
    await seedCart({ sessionToken: 'e2e-coupons-guest' });
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set('X-Cart-Session', 'e2e-coupons-guest')
      .send({ code: 'E2E_COUPON_SAVE', email: 'GUEST@EXAMPLE.COM' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.discountApplied).toBe('18.00');
      });
  });

  it('returns valid zero amounts for an empty cart', async () => {
    await createCoupon('E2E_COUPON_EMPTY');

    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .send({ code: 'E2E_COUPON_EMPTY' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          valid: true,
          discountApplied: '0.00',
          itemsSubtotal: '0.00',
        });
      });
  });

  it('returns all documented coupon validation errors', async () => {
    await createCoupon('E2E_COUPON_INACTIVE', { isActive: false });
    await createCoupon('E2E_COUPON_EXPIRED', {
      expire: new Date(Date.now() - 86_400_000),
    });
    await createCoupon('E2E_COUPON_EXHAUST', {
      maxUsage: 1,
      usedCount: 1,
    });
    const limited = await createCoupon('E2E_COUPON_LIMIT');
    await prisma.couponUsage.create({
      data: {
        couponId: limited.id,
        orderId: 'e2e-coupons-limit-order',
        userId: 'user_seed_customer',
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .send({ code: 'E2E_COUPON_MISSING' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .send({ code: 'E2E_COUPON_INACTIVE' })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('COUPON_INACTIVE'));
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .send({ code: 'E2E_COUPON_EXPIRED' })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('COUPON_EXPIRED'));
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .send({ code: 'E2E_COUPON_EXHAUST' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('COUPON_EXHAUSTED'));
    await request(app.getHttpServer())
      .post('/api/v1/coupons/validate')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ code: 'E2E_COUPON_LIMIT' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('COUPON_USER_LIMIT'));
  });
});
