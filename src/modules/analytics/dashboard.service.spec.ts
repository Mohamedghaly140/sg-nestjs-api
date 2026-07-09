/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
} from '../../generated/prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    order: {
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    coupon: {
      count: jest.fn(),
      fields: { maxUsage: 'coupon.maxUsage' },
    },
  };
  const service = new DashboardService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.order.aggregate.mockResolvedValue({ _sum: {} });
    prisma.order.count.mockResolvedValue(0);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.coupon.count.mockResolvedValue(0);
  });

  it('assembles month-over-month KPIs and dashboard sections in one call', async () => {
    // window calls run in Promise.all order: current revenue, previous revenue
    prisma.order.aggregate
      .mockResolvedValueOnce({
        _sum: { totalOrderPrice: new Prisma.Decimal('600.00') },
      })
      .mockResolvedValueOnce({
        _sum: { totalOrderPrice: new Prisma.Decimal('300.00') },
      });
    // current orders, previous orders, current paid, previous paid, pending
    prisma.order.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5);
    prisma.user.count.mockResolvedValueOnce(7).mockResolvedValueOnce(3);
    prisma.product.count.mockResolvedValueOnce(2);
    prisma.product.findMany.mockResolvedValueOnce([
      {
        id: 'prod_low',
        name: 'Scarf',
        quantity: 1,
        status: ProductStatus.ACTIVE,
        category: { name: 'Accessories' },
      },
    ]);
    prisma.coupon.count.mockResolvedValueOnce(3);
    prisma.order.groupBy.mockResolvedValueOnce([
      { status: OrderStatus.PENDING, _count: { _all: 5 } },
    ]);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { date: new Date('2026-07-01T00:00:00.000Z'), revenue: 600 },
      ])
      .mockResolvedValueOnce([
        {
          id: 'prod_1',
          name: 'Dress',
          imageUrl: 'https://example.test/dress.jpg',
          categoryName: 'Dresses',
          revenue: 600,
          units: 6,
        },
      ]);
    prisma.order.findMany.mockResolvedValueOnce([
      {
        id: 'order_1',
        humanOrderId: 'ORD-000042',
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        totalOrderPrice: new Prisma.Decimal('225.00'),
        createdAt: new Date('2026-07-09T12:00:00.000Z'),
        anonName: 'Anon Buyer',
        user: null,
      },
    ]);

    await expect(service.getMetrics()).resolves.toMatchObject({
      revenue: { current: 600, previous: 300 },
      orders: { current: 12, previous: 9 },
      newCustomers: { current: 7, previous: 3 },
      avgOrderValue: { current: 150, previous: 150 },
      pendingOrders: 5,
      lowStockCount: 2,
      activeCoupons: 3,
      ordersByStatus: [{ status: OrderStatus.PENDING, count: 5 }],
      revenueByDay: [{ date: '2026-07-01', revenue: 600 }],
      recentOrders: [
        expect.objectContaining({
          customerName: 'Anon Buyer',
          totalOrderPrice: 225,
        }),
      ],
      topProducts: [expect.objectContaining({ id: 'prod_1', units: 6 })],
      lowStockProducts: [
        {
          id: 'prod_low',
          name: 'Scarf',
          quantity: 1,
          categoryName: 'Accessories',
          status: ProductStatus.ACTIVE,
        },
      ],
    });

    // revenue windows must reconcile: paid only, cancelled/refunded excluded
    expect(prisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPaid: true,
          status: { notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED] },
        }),
      }),
    );
  });

  it('returns zero averages and Guest fallbacks when there is no data', async () => {
    prisma.order.findMany.mockResolvedValueOnce([
      {
        id: 'order_2',
        humanOrderId: 'ORD-000043',
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        totalOrderPrice: null,
        createdAt: new Date('2026-07-09T12:00:00.000Z'),
        anonName: null,
        user: null,
      },
    ]);

    await expect(service.getMetrics()).resolves.toMatchObject({
      revenue: { current: 0, previous: 0 },
      avgOrderValue: { current: 0, previous: 0 },
      recentOrders: [
        expect.objectContaining({ customerName: 'Guest', totalOrderPrice: 0 }),
      ],
    });
  });
});
