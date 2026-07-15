/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  OrderStatus,
  PaymentMethod,
  ProductStatus,
} from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

const PREFIX = 'e2e-analytics-';
const ORDER_PREFIX = 'E2E-AN-';
const USER_A = 'user_e2e_analytics_a';
const USER_B = 'user_e2e_analytics_b';

describe('/admin analytics and dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let dressId: string;
  let scarfId: string;
  let gownId: string;
  let couponAId: string;
  let couponBId: string;

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
    const orderIds = (
      await prisma.order.findMany({
        where: { humanOrderId: { startsWith: ORDER_PREFIX } },
        select: { id: true },
      })
    ).map((order) => order.id);

    await prisma.couponUsage.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { coupon: { name: { startsWith: 'E2E_ANALYTICS_' } } },
        ],
      },
    });
    await prisma.order.deleteMany({
      where: { humanOrderId: { startsWith: ORDER_PREFIX } },
    });
    await prisma.address.deleteMany({
      where: { alias: { startsWith: 'E2E Analytics' } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [USER_A, USER_B] } },
    });
    await prisma.coupon.deleteMany({
      where: { name: { startsWith: 'E2E_ANALYTICS_' } },
    });
    await prisma.product.deleteMany({
      where: { slug: { startsWith: PREFIX } },
    });
    await prisma.category.deleteMany({
      where: { slug: { startsWith: PREFIX } },
    });
  }

  async function resetFixtures() {
    await cleanup();

    const dresses = await prisma.category.create({
      data: { name: 'E2E Analytics Dresses', slug: `${PREFIX}dresses` },
    });
    const accessories = await prisma.category.create({
      data: { name: 'E2E Analytics Accessories', slug: `${PREFIX}accessories` },
    });

    const dress = await prisma.product.create({
      data: {
        name: 'E2E Analytics Dress',
        slug: `${PREFIX}dress`,
        description: 'Analytics dress',
        quantity: 5,
        price: '50000.00',
        discount: '0.00',
        priceAfterDiscount: '50000.00',
        sizes: ['M'],
        colors: ['Black'],
        imageId: 'e2e/analytics/dress',
        imageUrl: 'https://example.test/analytics-dress.jpg',
        status: ProductStatus.ACTIVE,
        categoryId: dresses.id,
      },
    });
    const scarf = await prisma.product.create({
      data: {
        name: 'E2E Analytics Scarf',
        slug: `${PREFIX}scarf`,
        description: 'Analytics scarf',
        quantity: 0,
        price: '1000.00',
        discount: '0.00',
        priceAfterDiscount: '1000.00',
        sizes: [],
        colors: ['Red'],
        imageId: 'e2e/analytics/scarf',
        imageUrl: 'https://example.test/analytics-scarf.jpg',
        status: ProductStatus.ACTIVE,
        categoryId: accessories.id,
      },
    });
    const gown = await prisma.product.create({
      data: {
        name: 'E2E Analytics Gown',
        slug: `${PREFIX}gown`,
        description: 'Analytics gown',
        quantity: 20,
        price: '50000.00',
        discount: '0.00',
        priceAfterDiscount: '50000.00',
        sizes: ['L'],
        colors: ['Blue'],
        imageId: 'e2e/analytics/gown',
        imageUrl: 'https://example.test/analytics-gown.jpg',
        status: ProductStatus.ACTIVE,
        categoryId: dresses.id,
      },
    });
    dressId = dress.id;
    scarfId = scarf.id;
    gownId = gown.id;

    await prisma.user.createMany({
      data: [
        {
          id: USER_A,
          email: 'analytics-a.e2e@sgcouture.test',
          name: 'Analytics Customer A',
          phone: '+201000010001',
          createdAt: new Date('2030-01-05T09:00:00.000Z'),
        },
        {
          id: USER_B,
          email: 'analytics-b.e2e@sgcouture.test',
          name: 'Analytics Customer B',
          phone: '+201000010002',
          createdAt: new Date('2029-12-15T09:00:00.000Z'),
        },
      ],
    });

    const addressA = await prisma.address.create({
      data: {
        alias: 'E2E Analytics Cairo',
        country: 'Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        area: 'District 7',
        phone: '+201000010001',
        addressLine1: '1 Analytics Street',
        details: 'Floor 1',
        userId: USER_A,
      },
    });
    const addressB = await prisma.address.create({
      data: {
        alias: 'E2E Analytics Alexandria',
        country: 'Egypt',
        governorate: 'Alexandria',
        city: 'Smouha',
        area: 'District 2',
        phone: '+201000010002',
        addressLine1: '2 Analytics Street',
        details: 'Floor 2',
        userId: USER_A,
      },
    });
    const addressOutside = await prisma.address.create({
      data: {
        alias: 'E2E Analytics Outside',
        country: 'Egypt',
        governorate: 'Cairo',
        city: 'Maadi',
        area: 'District 3',
        phone: '+201000010003',
        addressLine1: '3 Analytics Street',
        details: 'Floor 3',
        userId: USER_B,
      },
    });

    const couponA = await prisma.coupon.create({
      data: {
        name: 'E2E_ANALYTICS_A',
        discount: '10.00',
        usedCount: 2,
        maxUsage: 0,
        expire: new Date('2031-01-01T00:00:00.000Z'),
      },
    });
    const couponB = await prisma.coupon.create({
      data: {
        name: 'E2E_ANALYTICS_B',
        discount: '20.00',
        usedCount: 1,
        maxUsage: 10,
        expire: new Date('2031-01-01T00:00:00.000Z'),
      },
    });
    couponAId = couponA.id;
    couponBId = couponB.id;

    // Paid, delivered CASH order -> counts toward revenue/sold.
    await createOrder({
      humanOrderId: `${ORDER_PREFIX}0001`,
      status: OrderStatus.DELIVERED,
      paymentMethod: PaymentMethod.CASH,
      totalOrderPrice: '100000.00',
      discountApplied: '10.00',
      createdAt: new Date('2030-01-10T10:00:00.000Z'),
      isPaid: true,
      userId: USER_A,
      shippingAddressId: addressA.id,
      couponId: couponA.id,
      items: [{ productId: dress.id, quantity: 2, price: '50000.00' }],
    });
    // Cancelled, never paid -> excluded from revenue by status; counts stay unaffected.
    await createOrder({
      humanOrderId: `${ORDER_PREFIX}0002`,
      status: OrderStatus.CANCELLED,
      paymentMethod: PaymentMethod.CARD,
      totalOrderPrice: '200000.00',
      discountApplied: '20.00',
      createdAt: new Date('2030-01-11T10:00:00.000Z'),
      isPaid: false,
      userId: USER_A,
      shippingAddressId: addressB.id,
      couponId: couponA.id,
      items: [{ productId: dress.id, quantity: 4, price: '50000.00' }],
    });
    // Refunded orders keep isPaid=true (payment happened, then was reversed) -> must still
    // be excluded from revenue by the REFUNDED status check, not by isPaid alone.
    await createOrder({
      humanOrderId: `${ORDER_PREFIX}0003`,
      status: OrderStatus.REFUNDED,
      paymentMethod: PaymentMethod.CASH,
      totalOrderPrice: '300000.00',
      discountApplied: '30.00',
      createdAt: new Date('2030-01-12T10:00:00.000Z'),
      isPaid: true,
      anonGovernorate: 'Cairo',
      couponId: couponB.id,
      items: [{ productId: scarf.id, quantity: 3, price: '100000.00' }],
    });
    // Unpaid, non-terminal CARD order awaiting the (unimplemented) Geidea webhook -> must
    // NOT count toward revenue/sold even though its status isn't CANCELLED/REFUNDED.
    await createOrder({
      humanOrderId: `${ORDER_PREFIX}0004`,
      status: OrderStatus.PROCESSING,
      paymentMethod: PaymentMethod.CARD,
      totalOrderPrice: '150000.00',
      discountApplied: '0.00',
      createdAt: new Date('2030-01-13T10:00:00.000Z'),
      isPaid: false,
      anonGovernorate: 'Giza',
      items: [{ productId: gown.id, quantity: 3, price: '50000.00' }],
    });
    // Paid, delivered CASH order -> counts toward revenue/sold.
    await createOrder({
      humanOrderId: `${ORDER_PREFIX}0005`,
      status: OrderStatus.DELIVERED,
      paymentMethod: PaymentMethod.CASH,
      totalOrderPrice: '999999.00',
      discountApplied: '0.00',
      createdAt: new Date('2030-02-05T10:00:00.000Z'),
      isPaid: true,
      userId: USER_B,
      shippingAddressId: addressOutside.id,
      items: [{ productId: gown.id, quantity: 1, price: '999999.00' }],
    });
  }

  async function createOrder(params: {
    humanOrderId: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    totalOrderPrice: string;
    discountApplied: string;
    createdAt: Date;
    isPaid?: boolean;
    userId?: string;
    shippingAddressId?: string;
    anonGovernorate?: string;
    couponId?: string;
    items: Array<{ productId: string; quantity: number; price: string }>;
  }) {
    const order = await prisma.order.create({
      data: {
        humanOrderId: params.humanOrderId,
        status: params.status,
        paymentMethod: params.paymentMethod,
        shippingFees: '0.00',
        totalOrderPrice: params.totalOrderPrice,
        discountApplied: params.discountApplied,
        isPaid: params.isPaid ?? false,
        userId: params.userId,
        shippingAddressId: params.shippingAddressId,
        anonName: params.userId ? null : 'Analytics Guest',
        anonPhone: params.userId ? null : '+201000099999',
        anonEmail: params.userId ? null : `${params.humanOrderId}@guest.test`,
        anonCountry: params.userId ? null : 'Egypt',
        anonGovernorate: params.anonGovernorate,
        anonCity: params.userId ? null : 'Guest City',
        anonArea: params.userId ? null : 'Guest Area',
        anonShippingPhone: params.userId ? null : '+201000099999',
        anonAddressLine1: params.userId ? null : 'Guest Street',
        anonDetails: params.userId ? null : 'Guest Details',
        couponId: params.couponId,
        createdAt: params.createdAt,
        updatedAt: params.createdAt,
        items: {
          create: params.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
    });

    if (params.couponId) {
      await prisma.couponUsage.create({
        data: {
          couponId: params.couponId,
          orderId: order.id,
          userId: params.userId,
          anonEmail: params.userId ? null : `${params.humanOrderId}@guest.test`,
        },
      });
    }

    return order;
  }

  const range = 'from=2030-01-01&to=2030-01-31';

  it('allows only ADMIN on all six endpoints', async () => {
    const paths = [
      '/api/v1/admin/dashboard/metrics',
      `/api/v1/admin/analytics/sales?${range}`,
      `/api/v1/admin/analytics/products?${range}`,
      `/api/v1/admin/analytics/customers?${range}`,
      `/api/v1/admin/analytics/coupons?${range}`,
      `/api/v1/admin/analytics/geography?${range}`,
    ];

    for (const path of paths) {
      await request(app.getHttpServer())
        .get(path)
        .set(authHeader(TEST_TOKENS.manager))
        .expect(403);
      await request(app.getHttpServer())
        .get(path)
        .set(authHeader(TEST_TOKENS.customer))
        .expect(403);
    }
  });

  it('returns exact sales analytics with revenue requiring isPaid and excluding cancelled/refunded, counts including all statuses/payment', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/analytics/sales?${range}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          totalRevenue: 100000,
          totalOrders: 4,
          avgOrderValue: 100000,
          totalDiscountApplied: 60,
          grouping: 'day',
        });
        // Order 0004 (unpaid PROCESSING/CARD) must NOT appear despite being in range and
        // not cancelled/refunded.
        expect(body.data.revenueOverTime).toEqual([
          { date: '2030-01-10', revenue: 100000 },
        ]);
        expect(body.data.ordersByStatus).toEqual(
          expect.arrayContaining([
            { status: OrderStatus.DELIVERED, count: 1 },
            { status: OrderStatus.CANCELLED, count: 1 },
            { status: OrderStatus.REFUNDED, count: 1 },
            { status: OrderStatus.PROCESSING, count: 1 },
          ]),
        );
        expect(body.data.paymentMethodSplit).toEqual(
          expect.arrayContaining([
            { method: PaymentMethod.CARD, count: 2 },
            { method: PaymentMethod.CASH, count: 2 },
          ]),
        );
      });
  });

  it('returns exact product analytics for paid sales aggregates while preserving catalog counts', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/analytics/products?${range}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        // Order 0004's unpaid gown units/revenue must not be counted.
        expect(body.data.totalUnitsSold).toBe(2);
        expect(body.data.activeProductsCount).toBeGreaterThanOrEqual(3);
        expect(body.data.outOfStockCount).toBeGreaterThanOrEqual(1);
        expect(body.data.topProducts).toEqual(
          expect.arrayContaining([
            {
              id: gownId,
              name: 'E2E Analytics Gown',
              categoryName: 'E2E Analytics Dresses',
              sold: 0,
              revenue: 0,
            },
            {
              id: dressId,
              name: 'E2E Analytics Dress',
              categoryName: 'E2E Analytics Dresses',
              sold: 2,
              revenue: 100000,
            },
          ]),
        );
        expect(body.data.revenueByCategory).toEqual(
          expect.arrayContaining([
            { name: 'E2E Analytics Dresses', revenue: 100000 },
            { name: 'E2E Analytics Accessories', revenue: 0 },
          ]),
        );
      });
  });

  it('returns exact customer analytics for the selected range', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/analytics/customers?${range}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.newThisPeriod).toBe(1);
        expect(body.data.activeThisPeriod).toBe(1);
        expect(body.data.grouping).toBe('day');
        expect(body.data.newCustomersOverTime).toEqual([
          { date: '2030-01-05', count: 1 },
        ]);
        expect(body.data.topSpenders).toEqual([
          {
            id: USER_A,
            name: 'Analytics Customer A',
            email: 'analytics-a.e2e@sgcouture.test',
            ordersCount: 1,
            totalSpent: 100000,
          },
        ]);
      });
  });

  it('returns exact coupon analytics with discount totals including all statuses', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/analytics/coupons?${range}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.totalRedemptions).toBe(3);
        expect(body.data.totalDiscountGiven).toBe(60);
        expect(body.data.coupons).toEqual(
          expect.arrayContaining([
            {
              id: couponAId,
              name: 'E2E_ANALYTICS_A',
              discountPct: 10,
              usedCount: 2,
              maxUsage: 0,
              expire: '2031-01-01T00:00:00.000Z',
              periodRedemptions: 2,
              totalDiscountGiven: 30,
            },
            {
              id: couponBId,
              name: 'E2E_ANALYTICS_B',
              discountPct: 20,
              usedCount: 1,
              maxUsage: 10,
              expire: '2031-01-01T00:00:00.000Z',
              periodRedemptions: 1,
              totalDiscountGiven: 30,
            },
          ]),
        );
      });
  });

  it('returns exact geography analytics using shipping-address-first governorate grouping', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/admin/analytics/geography?${range}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        // orderCount is payment-agnostic (all statuses); Giza revenue is 0 because its only
        // order (0004) is unpaid, even though orderCount still counts it.
        expect(body.data.rows).toEqual([
          { governorate: 'Cairo', orderCount: 2, revenue: 100000 },
          { governorate: 'Alexandria', orderCount: 1, revenue: 0 },
          { governorate: 'Giza', orderCount: 1, revenue: 0 },
        ]);
      });
  });

  it('returns dashboard metrics with plain numeric recent order totals and top product revenue', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard/metrics')
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        const data = body.data as {
          recentOrders: Array<{
            humanOrderId: string;
            totalOrderPrice: number;
          }>;
          topProducts: unknown[];
          lowStockProducts: unknown[];
        };
        const recent = data.recentOrders.find(
          (order: { humanOrderId: string }) =>
            order.humanOrderId === `${ORDER_PREFIX}0005`,
        );
        if (!recent) {
          throw new Error('Expected seeded recent order to be present');
        }
        expect(recent).toMatchObject({
          humanOrderId: `${ORDER_PREFIX}0005`,
          totalOrderPrice: 999999,
        });
        expect(typeof recent.totalOrderPrice).toBe('number');
        // Gown revenue/units only reflect order 0005 (paid); order 0004's unpaid gown
        // units/revenue are excluded even though topProducts is an all-time aggregate.
        expect(data.topProducts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: gownId,
              name: 'E2E Analytics Gown',
              revenue: 999999,
              units: 1,
            }),
            expect.objectContaining({
              id: dressId,
              name: 'E2E Analytics Dress',
              revenue: 100000,
              units: 2,
            }),
          ]),
        );
        expect(data.lowStockProducts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: dressId, quantity: 5 }),
            expect.objectContaining({ id: scarfId, quantity: 0 }),
          ]),
        );
      });
  });
});
