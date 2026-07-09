import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  ProductStatus,
  Role,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardMetricsResponseDto } from './dto/dashboard-metrics-response.dto';
import { EXCLUDED_REVENUE_STATUSES } from './utils/analytics.constants';
import {
  coercePlainNumber,
  formatBucketDate,
  roundMetric,
} from './utils/resolve-date-range.util';

type RevenueByDayRow = {
  date: Date;
  revenue: number;
};

type TopProductRow = {
  id: string;
  name: string;
  imageUrl: string;
  categoryName: string;
  revenue: number;
  units: number;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<DashboardMetricsResponseDto> {
    const now = new Date();
    const currentStart = startOfUtcMonth(now);
    const previousStart = new Date(currentStart);
    previousStart.setUTCMonth(previousStart.getUTCMonth() - 1);
    const previousEnd = new Date(currentStart.getTime() - 1);
    const trailingStart = startOfUtcDay(addUtcDays(now, -30));

    const [
      currentRevenue,
      previousRevenue,
      currentOrders,
      previousOrders,
      currentPaidOrders,
      previousPaidOrders,
      currentNewCustomers,
      previousNewCustomers,
      pendingOrders,
      lowStockCount,
      lowStockProducts,
      activeCoupons,
      ordersByStatus,
      revenueByDay,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      this.revenueInWindow(currentStart, now),
      this.revenueInWindow(previousStart, previousEnd),
      this.orderCountInWindow(currentStart, now),
      this.orderCountInWindow(previousStart, previousEnd),
      this.paidOrderCountInWindow(currentStart, now),
      this.paidOrderCountInWindow(previousStart, previousEnd),
      this.newCustomerCountInWindow(currentStart, now),
      this.newCustomerCountInWindow(previousStart, previousEnd),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.product.count({
        where: { status: ProductStatus.ACTIVE, quantity: { lt: 10 } },
      }),
      this.prisma.product.findMany({
        where: { status: ProductStatus.ACTIVE, quantity: { lt: 10 } },
        select: {
          id: true,
          name: true,
          quantity: true,
          status: true,
          category: { select: { name: true } },
        },
        orderBy: [{ quantity: 'asc' }, { name: 'asc' }],
        take: 20,
      }),
      this.prisma.coupon.count({
        where: {
          isActive: true,
          expire: { gt: now },
          OR: [
            { maxUsage: 0 },
            { usedCount: { lt: this.prisma.coupon.fields.maxUsage } },
          ],
        },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.getRevenueByDay(trailingStart, now),
      this.prisma.order.findMany({
        select: {
          id: true,
          humanOrderId: true,
          status: true,
          paymentMethod: true,
          totalOrderPrice: true,
          createdAt: true,
          anonName: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.getTopProducts(),
    ]);

    return {
      revenue: {
        current: currentRevenue,
        previous: previousRevenue,
      },
      orders: {
        current: currentOrders,
        previous: previousOrders,
      },
      newCustomers: {
        current: currentNewCustomers,
        previous: previousNewCustomers,
      },
      avgOrderValue: {
        current: average(currentRevenue, currentPaidOrders),
        previous: average(previousRevenue, previousPaidOrders),
      },
      pendingOrders,
      lowStockCount,
      activeCoupons,
      ordersByStatus: ordersByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      revenueByDay: revenueByDay.map((row) => ({
        date: formatBucketDate(row.date),
        revenue: coercePlainNumber(row.revenue),
      })),
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        humanOrderId: order.humanOrderId,
        customerName: order.user?.name ?? order.anonName ?? 'Guest',
        status: order.status,
        paymentMethod: order.paymentMethod,
        totalOrderPrice: coercePlainNumber(order.totalOrderPrice),
        createdAt: order.createdAt,
      })),
      topProducts: topProducts.map((row) => ({
        id: row.id,
        name: row.name,
        imageUrl: row.imageUrl,
        categoryName: row.categoryName,
        revenue: coercePlainNumber(row.revenue),
        units: coercePlainNumber(row.units),
      })),
      lowStockProducts: lowStockProducts.map((product) => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        categoryName: product.category.name,
        status: product.status,
      })),
    };
  }

  private async revenueInWindow(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.order.aggregate({
      where: {
        createdAt: { gte: start, lte: end },
        isPaid: true,
        status: { notIn: [...EXCLUDED_REVENUE_STATUSES] },
      },
      _sum: { totalOrderPrice: true },
    });

    return coercePlainNumber(result._sum.totalOrderPrice);
  }

  private orderCountInWindow(start: Date, end: Date): Promise<number> {
    return this.prisma.order.count({
      where: { createdAt: { gte: start, lte: end } },
    });
  }

  private paidOrderCountInWindow(start: Date, end: Date): Promise<number> {
    return this.prisma.order.count({
      where: {
        createdAt: { gte: start, lte: end },
        isPaid: true,
        status: { notIn: [...EXCLUDED_REVENUE_STATUSES] },
      },
    });
  }

  private newCustomerCountInWindow(start: Date, end: Date): Promise<number> {
    return this.prisma.user.count({
      where: {
        role: Role.USER,
        createdAt: { gte: start, lte: end },
      },
    });
  }

  private async getRevenueByDay(
    start: Date,
    end: Date,
  ): Promise<RevenueByDayRow[]> {
    return this.prisma.$queryRaw<RevenueByDayRow[]>(Prisma.sql`
      SELECT
        DATE_TRUNC('day', o."createdAt")::date AS "date",
        COALESCE(SUM(o."totalOrderPrice"), 0)::float8 AS "revenue"
      FROM "orders" o
      WHERE o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
        AND o."isPaid" = true
        AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private async getTopProducts(): Promise<TopProductRow[]> {
    return this.prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
      SELECT
        p."id" AS "id",
        p."name" AS "name",
        p."imageUrl" AS "imageUrl",
        c."name" AS "categoryName",
        COALESCE(SUM(oi."quantity" * oi."price"), 0)::float8 AS "revenue",
        COALESCE(SUM(oi."quantity"), 0)::int AS "units"
      FROM "orderItems" oi
      INNER JOIN "orders" o ON o."id" = oi."orderId"
      INNER JOIN "products" p ON p."id" = oi."productId"
      INNER JOIN "categories" c ON c."id" = p."categoryId"
      WHERE o."isPaid" = true
        AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
      GROUP BY p."id", p."name", p."imageUrl", c."name"
      ORDER BY "revenue" DESC, "units" DESC, p."name" ASC
      LIMIT 5
    `);
  }
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function startOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function addUtcDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function average(total: number, count: number): number {
  return count === 0 ? 0 : roundMetric(total / count);
}
