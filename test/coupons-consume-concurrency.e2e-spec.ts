import type { INestApplication } from '@nestjs/common';
import { CouponsService } from '../src/modules/coupons/coupons.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('CouponsService consume/release concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let couponsService: CouponsService;

  beforeAll(async () => {
    ({ app, prisma } = await createCatalogTestApp());
    couponsService = app.get(CouponsService);
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

  it('allows exactly one concurrent consumer of the last global use', async () => {
    const coupon = await prisma.coupon.create({
      data: {
        name: 'E2E_COUPON_RACE',
        discount: '10.00',
        maxUsage: 1,
        usedCount: 0,
        perUserLimit: 0,
        expire: new Date(Date.now() + 86_400_000),
      },
    });

    const results = await Promise.allSettled([
      prisma.$transaction((tx) =>
        couponsService.consumeCoupon(tx, {
          couponId: coupon.id,
          orderId: 'e2e-coupons-race-order-1',
          anonEmail: 'one@example.com',
        }),
      ),
      prisma.$transaction((tx) =>
        couponsService.consumeCoupon(tx, {
          couponId: coupon.id,
          orderId: 'e2e-coupons-race-order-2',
          anonEmail: 'two@example.com',
        }),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { response: { code: 'COUPON_EXHAUSTED' } },
    });
    await expect(
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
    ).resolves.toMatchObject({ usedCount: 1 });
  });

  it('allows exactly one concurrent consumer for the same user under a per-user limit', async () => {
    const coupon = await prisma.coupon.create({
      data: {
        name: 'E2E_COUPON_USER_RACE',
        discount: '10.00',
        maxUsage: 0,
        usedCount: 0,
        perUserLimit: 1,
        expire: new Date(Date.now() + 86_400_000),
      },
    });

    const results = await Promise.allSettled([
      prisma.$transaction((tx) =>
        couponsService.consumeCoupon(tx, {
          couponId: coupon.id,
          orderId: 'e2e-coupons-user-race-order-1',
          userId: 'user_seed_customer',
        }),
      ),
      prisma.$transaction((tx) =>
        couponsService.consumeCoupon(tx, {
          couponId: coupon.id,
          orderId: 'e2e-coupons-user-race-order-2',
          userId: 'user_seed_customer',
        }),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { response: { code: 'COUPON_USER_LIMIT' } },
    });
    await expect(
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
    ).resolves.toMatchObject({ usedCount: 1 });
    await expect(
      prisma.couponUsage.findMany({ where: { couponId: coupon.id } }),
    ).resolves.toHaveLength(1);
  });

  it('releases consumed coupons and no-ops when nothing was consumed', async () => {
    const coupon = await prisma.coupon.create({
      data: {
        name: 'E2E_COUPON_RELEASE',
        discount: '10.00',
        maxUsage: 1,
        usedCount: 0,
        perUserLimit: 0,
        expire: new Date(Date.now() + 86_400_000),
      },
    });

    await prisma.$transaction((tx) =>
      couponsService.consumeCoupon(tx, {
        couponId: coupon.id,
        orderId: 'e2e-coupons-release-order',
        userId: 'user_seed_customer',
      }),
    );
    await prisma.$transaction((tx) =>
      couponsService.releaseCoupon(tx, coupon.id, 'e2e-coupons-release-order'),
    );

    await expect(
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
    ).resolves.toMatchObject({ usedCount: 0 });
    await expect(
      prisma.couponUsage.findMany({ where: { couponId: coupon.id } }),
    ).resolves.toHaveLength(0);

    await prisma.$transaction((tx) =>
      couponsService.releaseCoupon(tx, coupon.id, 'missing-order'),
    );
    await expect(
      prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }),
    ).resolves.toMatchObject({ usedCount: 0 });
  });
});
