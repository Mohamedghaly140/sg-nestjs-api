/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
  Role,
} from '../../generated/prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    order: {
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    orderItem: {
      aggregate: jest.fn(),
    },
    product: {
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    coupon: {
      count: jest.fn(),
    },
  };
  const service = new AnalyticsService(prisma as never);
  const query = { from: '2026-06-01', to: '2026-06-30' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.order.aggregate.mockResolvedValue({ _sum: {} });
    prisma.order.count.mockResolvedValue(0);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.orderItem.aggregate.mockResolvedValue({ _sum: {} });
    prisma.product.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.coupon.count.mockResolvedValue(0);
  });

  describe('getSales', () => {
    it('computes paid-only revenue, avg order value, and grouped breakdowns', async () => {
      prisma.order.aggregate
        .mockResolvedValueOnce({
          _sum: { totalOrderPrice: new Prisma.Decimal('500.00') },
        })
        .mockResolvedValueOnce({
          _sum: { discountApplied: new Prisma.Decimal('40.00') },
        });
      prisma.order.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
      prisma.$queryRaw.mockResolvedValueOnce([
        { date: new Date('2026-06-01T00:00:00.000Z'), revenue: 500 },
      ]);
      prisma.order.groupBy
        .mockResolvedValueOnce([
          { status: OrderStatus.PENDING, _count: { _all: 6 } },
          { status: OrderStatus.DELIVERED, _count: { _all: 4 } },
        ])
        .mockResolvedValueOnce([
          { paymentMethod: PaymentMethod.CASH, _count: { _all: 10 } },
        ]);

      await expect(service.getSales(query)).resolves.toMatchObject({
        totalRevenue: 500,
        totalOrders: 10,
        avgOrderValue: 125,
        totalDiscountApplied: 40,
        revenueOverTime: [{ date: '2026-06-01', revenue: 500 }],
        ordersByStatus: [
          { status: OrderStatus.PENDING, count: 6 },
          { status: OrderStatus.DELIVERED, count: 4 },
        ],
        paymentMethodSplit: [{ method: PaymentMethod.CASH, count: 10 }],
      });

      // the revenue aggregate must reconcile: paid only, cancelled/refunded excluded
      expect(prisma.order.aggregate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            isPaid: true,
            status: {
              notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
            },
          }),
        }),
      );
    });

    it('returns a zero avg order value when there are no paid orders', async () => {
      await expect(service.getSales(query)).resolves.toMatchObject({
        totalRevenue: 0,
        avgOrderValue: 0,
      });
    });
  });

  describe('getProducts', () => {
    it('maps unit totals, stock counts, and raw top-product rows', async () => {
      prisma.orderItem.aggregate.mockResolvedValueOnce({
        _sum: { quantity: 12 },
      });
      prisma.product.count.mockResolvedValueOnce(30).mockResolvedValueOnce(3);
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 'prod_1',
            name: 'Dress',
            categoryName: 'Dresses',
            sold: 12,
            revenue: 960,
          },
        ])
        .mockResolvedValueOnce([{ name: 'Dresses', revenue: 960 }]);

      await expect(service.getProducts(query)).resolves.toEqual({
        totalUnitsSold: 12,
        activeProductsCount: 30,
        outOfStockCount: 3,
        topProducts: [
          {
            id: 'prod_1',
            name: 'Dress',
            categoryName: 'Dresses',
            sold: 12,
            revenue: 960,
          },
        ],
        revenueByCategory: [{ name: 'Dresses', revenue: 960 }],
      });
      expect(prisma.product.count).toHaveBeenNthCalledWith(2, {
        where: { status: ProductStatus.ACTIVE, quantity: 0 },
      });
    });
  });

  describe('getCustomers', () => {
    it('counts customers, actives via distinct order users, and maps spenders', async () => {
      prisma.user.count.mockResolvedValueOnce(100).mockResolvedValueOnce(8);
      prisma.order.findMany.mockResolvedValueOnce([
        { userId: 'user_1' },
        { userId: 'user_2' },
      ]);
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { date: new Date('2026-06-01T00:00:00.000Z'), count: 8 },
        ])
        .mockResolvedValueOnce([
          {
            id: 'user_1',
            name: 'Customer',
            email: 'c@example.com',
            ordersCount: 3,
            totalSpent: 900,
          },
        ]);

      await expect(service.getCustomers(query)).resolves.toMatchObject({
        totalCustomers: 100,
        newThisPeriod: 8,
        activeThisPeriod: 2,
        newCustomersOverTime: [{ date: '2026-06-01', count: 8 }],
        topSpenders: [
          expect.objectContaining({ id: 'user_1', totalSpent: 900 }),
        ],
      });
      expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
        where: { role: Role.USER },
      });
    });
  });

  describe('getCoupons', () => {
    it('aggregates redemptions and per-coupon usage rows', async () => {
      const expire = new Date('2026-12-31T00:00:00.000Z');
      prisma.coupon.count.mockResolvedValueOnce(5);
      prisma.order.count.mockResolvedValueOnce(7);
      prisma.order.aggregate.mockResolvedValueOnce({
        _sum: { discountApplied: new Prisma.Decimal('140.00') },
      });
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'coupon_1',
          name: 'SAVE20',
          discountPct: 20,
          usedCount: 7,
          maxUsage: 100,
          expire,
          periodRedemptions: 7,
          totalDiscountGiven: 140,
        },
      ]);

      await expect(service.getCoupons(query)).resolves.toEqual({
        totalCoupons: 5,
        totalRedemptions: 7,
        totalDiscountGiven: 140,
        coupons: [
          {
            id: 'coupon_1',
            name: 'SAVE20',
            discountPct: 20,
            usedCount: 7,
            maxUsage: 100,
            expire,
            periodRedemptions: 7,
            totalDiscountGiven: 140,
          },
        ],
      });
      expect(prisma.order.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ couponId: { not: null } }),
      });
    });
  });

  describe('getGeography', () => {
    it('maps governorate rows with coerced numerics', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { governorate: 'Cairo', orderCount: 9, revenue: 1800 },
      ]);

      await expect(service.getGeography(query)).resolves.toEqual({
        rows: [{ governorate: 'Cairo', orderCount: 9, revenue: 1800 }],
      });
    });
  });
});
