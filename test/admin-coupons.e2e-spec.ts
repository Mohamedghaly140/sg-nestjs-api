/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/admin/coupons (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    await cleanup();
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
  }

  async function seedCoupon(name: string, overrides = {}) {
    return prisma.coupon.create({
      data: {
        name,
        discount: '10.00',
        maxUsage: 10,
        perUserLimit: 1,
        expire: new Date(Date.now() + 86_400_000),
        ...overrides,
      },
    });
  }

  it('requires Manager+ and creates/updates coupons with validation', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/coupons')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(403);

    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/coupons')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name: 'e2e_coupon_create',
        discount: 15,
        expire: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(201);
    expect(createResponse.body.data.name).toBe('E2E_COUPON_CREATE');

    await request(app.getHttpServer())
      .post('/api/v1/admin/coupons')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name: 'bad code!',
        discount: 15,
        expire: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(422);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${createResponse.body.data.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ expire: new Date(Date.now() - 86_400_000).toISOString() })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.id).toBe(createResponse.body.data.id);
      });
  });

  it('does not reset unspecified fields or reactivate on a partial PATCH', async () => {
    const seeded = await seedCoupon('E2E_COUPON_PARTIAL_PATCH', {
      maxUsage: 5,
      perUserLimit: 2,
      isActive: false,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${seeded.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ discount: 25 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.discount).toBe('25');
        expect(body.data.maxUsage).toBe(5);
        expect(body.data.perUserLimit).toBe(2);
        expect(body.data.isActive).toBe(false);
      });
  });

  it('supports search/status filters, duplicate conflicts, blocked delete, and deactivate', async () => {
    const active = await seedCoupon('E2E_COUPON_ACTIVE');
    await seedCoupon('E2E_COUPON_EXPIRED', {
      expire: new Date(Date.now() - 86_400_000),
    });
    await seedCoupon('E2E_COUPON_EXHAUST', {
      maxUsage: 1,
      usedCount: 1,
    });
    const deactivated = await seedCoupon('E2E_COUPON_OFF', {
      isActive: false,
    });

    await request(app.getHttpServer())
      .get('/api/v1/admin/coupons?search=ACTIVE&status=active')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.data.map((coupon: { name: string }) => coupon.name),
        ).toContain('E2E_COUPON_ACTIVE');
      });

    await request(app.getHttpServer())
      .get('/api/v1/admin/coupons?status=expired')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        expect(
          body.data.map((coupon: { name: string }) => coupon.name),
        ).toContain('E2E_COUPON_EXPIRED');
      });

    await request(app.getHttpServer())
      .post('/api/v1/admin/coupons')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name: 'E2E_COUPON_ACTIVE',
        discount: 10,
        expire: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(409);

    await prisma.couponUsage.create({
      data: {
        couponId: active.id,
        orderId: 'e2e-coupons-used-order',
        anonEmail: 'guest@example.com',
      },
    });
    await prisma.coupon.update({
      where: { id: active.id },
      data: { usedCount: 1 },
    });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/coupons/${active.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('COUPON_IN_USE'));

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${deactivated.id}/deactivate`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => expect(body.data.isActive).toBe(false));
  });
});
