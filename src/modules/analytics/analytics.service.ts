import { Injectable } from '@nestjs/common';
import { Prisma, ProductStatus, Role } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsAnalyticsResponseDto } from './dto/coupons-analytics-response.dto';
import { CustomersAnalyticsResponseDto } from './dto/customers-analytics-response.dto';
import { GeographyAnalyticsResponseDto } from './dto/geography-analytics-response.dto';
import { ProductsAnalyticsResponseDto } from './dto/products-analytics-response.dto';
import { QueryAnalyticsRangeDto } from './dto/query-analytics-range.dto';
import { SalesAnalyticsResponseDto } from './dto/sales-analytics-response.dto';
import { EXCLUDED_REVENUE_STATUSES } from './utils/analytics.constants';
import {
  AnalyticsDateRange,
  AnalyticsGrouping,
  coercePlainNumber,
  dateTruncUnit,
  formatBucketDate,
  resolveDateRange,
  resolveGrouping,
  roundMetric,
} from './utils/resolve-date-range.util';

type RevenuePointRow = { date: Date; revenue: number };
type CountPointRow = { date: Date; count: number };
type ProductRow = {
  id: string;
  name: string;
  categoryName: string;
  sold: number;
  revenue: number;
};
type CategoryRevenueRow = { name: string; revenue: number };
type TopSpenderRow = {
  id: string;
  name: string;
  email: string;
  ordersCount: number;
  totalSpent: number;
};
type CouponRow = {
  id: string;
  name: string;
  discountPct: number;
  usedCount: number;
  maxUsage: number;
  expire: Date;
  periodRedemptions: number;
  totalDiscountGiven: number;
};
type GeographyRow = {
  governorate: string;
  orderCount: number;
  revenue: number;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSales(
    query: QueryAnalyticsRangeDto,
  ): Promise<SalesAnalyticsResponseDto> {
    const range = resolveDateRange(query.from, query.to);
    const grouping = resolveGrouping(range.start, range.end);

    const [
      totalRevenue,
      totalOrders,
      paidOrderCount,
      discountAggregate,
      revenueOverTime,
      ordersByStatus,
      paymentMethodSplit,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: this.revenueOrderWhere(range),
        _sum: { totalOrderPrice: true },
      }),
      this.prisma.order.count({ where: this.orderRangeWhere(range) }),
      this.prisma.order.count({ where: this.revenueOrderWhere(range) }),
      this.prisma.order.aggregate({
        where: this.orderRangeWhere(range),
        _sum: { discountApplied: true },
      }),
      this.getRevenueOverTime(range, grouping),
      this.prisma.order.groupBy({
        by: ['status'],
        where: this.orderRangeWhere(range),
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['paymentMethod'],
        where: this.orderRangeWhere(range),
        _count: { _all: true },
        orderBy: { paymentMethod: 'asc' },
      }),
    ]);

    const revenue = coercePlainNumber(totalRevenue._sum.totalOrderPrice);

    return {
      totalRevenue: revenue,
      totalOrders,
      avgOrderValue:
        paidOrderCount === 0 ? 0 : roundMetric(revenue / paidOrderCount),
      totalDiscountApplied: coercePlainNumber(
        discountAggregate._sum.discountApplied,
      ),
      grouping,
      revenueOverTime: revenueOverTime.map((row) => ({
        date: formatBucketDate(row.date),
        revenue: coercePlainNumber(row.revenue),
      })),
      ordersByStatus: ordersByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
      })),
      paymentMethodSplit: paymentMethodSplit.map((row) => ({
        method: row.paymentMethod,
        count: row._count._all,
      })),
    };
  }

  async getProducts(
    query: QueryAnalyticsRangeDto,
  ): Promise<ProductsAnalyticsResponseDto> {
    const range = resolveDateRange(query.from, query.to);

    const [
      unitsAggregate,
      activeProductsCount,
      outOfStockCount,
      topProducts,
      revenueByCategory,
    ] = await Promise.all([
      this.prisma.orderItem.aggregate({
        where: { order: this.revenueOrderWhere(range) },
        _sum: { quantity: true },
      }),
      this.prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
      this.prisma.product.count({
        where: { status: ProductStatus.ACTIVE, quantity: 0 },
      }),
      this.getTopProducts(range),
      this.getRevenueByCategory(range),
    ]);

    return {
      totalUnitsSold: coercePlainNumber(unitsAggregate._sum.quantity),
      activeProductsCount,
      outOfStockCount,
      topProducts: topProducts.map((row) => ({
        id: row.id,
        name: row.name,
        categoryName: row.categoryName,
        sold: coercePlainNumber(row.sold),
        revenue: coercePlainNumber(row.revenue),
      })),
      revenueByCategory: revenueByCategory.map((row) => ({
        name: row.name,
        revenue: coercePlainNumber(row.revenue),
      })),
    };
  }

  async getCustomers(
    query: QueryAnalyticsRangeDto,
  ): Promise<CustomersAnalyticsResponseDto> {
    const range = resolveDateRange(query.from, query.to);
    const grouping = resolveGrouping(range.start, range.end);

    const [
      totalCustomers,
      newThisPeriod,
      activeCustomers,
      newCustomersOverTime,
      topSpenders,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: Role.USER } }),
      this.prisma.user.count({
        where: {
          role: Role.USER,
          createdAt: { gte: range.start, lte: range.end },
        },
      }),
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: range.start, lte: range.end },
          userId: { not: null },
          user: { role: Role.USER },
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.getNewCustomersOverTime(range, grouping),
      this.getTopSpenders(range),
    ]);

    return {
      totalCustomers,
      newThisPeriod,
      activeThisPeriod: activeCustomers.length,
      grouping,
      newCustomersOverTime: newCustomersOverTime.map((row) => ({
        date: formatBucketDate(row.date),
        count: coercePlainNumber(row.count),
      })),
      topSpenders: topSpenders.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        ordersCount: coercePlainNumber(row.ordersCount),
        totalSpent: coercePlainNumber(row.totalSpent),
      })),
    };
  }

  async getCoupons(
    query: QueryAnalyticsRangeDto,
  ): Promise<CouponsAnalyticsResponseDto> {
    const range = resolveDateRange(query.from, query.to);

    const [totalCoupons, totalRedemptions, discountAggregate, coupons] =
      await Promise.all([
        this.prisma.coupon.count(),
        this.prisma.order.count({
          where: { ...this.orderRangeWhere(range), couponId: { not: null } },
        }),
        this.prisma.order.aggregate({
          where: { ...this.orderRangeWhere(range), couponId: { not: null } },
          _sum: { discountApplied: true },
        }),
        this.getCouponRows(range),
      ]);

    return {
      totalCoupons,
      totalRedemptions,
      totalDiscountGiven: coercePlainNumber(
        discountAggregate._sum.discountApplied,
      ),
      coupons: coupons.map((row) => ({
        id: row.id,
        name: row.name,
        discountPct: coercePlainNumber(row.discountPct),
        usedCount: coercePlainNumber(row.usedCount),
        maxUsage: coercePlainNumber(row.maxUsage),
        expire: row.expire,
        periodRedemptions: coercePlainNumber(row.periodRedemptions),
        totalDiscountGiven: coercePlainNumber(row.totalDiscountGiven),
      })),
    };
  }

  async getGeography(
    query: QueryAnalyticsRangeDto,
  ): Promise<GeographyAnalyticsResponseDto> {
    const range = resolveDateRange(query.from, query.to);
    const rows = await this.getGeographyRows(range);

    return {
      rows: rows.map((row) => ({
        governorate: row.governorate,
        orderCount: coercePlainNumber(row.orderCount),
        revenue: coercePlainNumber(row.revenue),
      })),
    };
  }

  private orderRangeWhere(range: AnalyticsDateRange): Prisma.OrderWhereInput {
    return { createdAt: { gte: range.start, lte: range.end } };
  }

  private revenueOrderWhere(range: AnalyticsDateRange): Prisma.OrderWhereInput {
    return {
      ...this.orderRangeWhere(range),
      isPaid: true,
      status: { notIn: [...EXCLUDED_REVENUE_STATUSES] },
    };
  }

  private async getRevenueOverTime(
    range: AnalyticsDateRange,
    grouping: AnalyticsGrouping,
  ): Promise<RevenuePointRow[]> {
    return this.prisma.$queryRaw<RevenuePointRow[]>(Prisma.sql`
      SELECT
        DATE_TRUNC(${dateTruncUnit(grouping)}, o."createdAt")::date AS "date",
        COALESCE(SUM(o."totalOrderPrice"), 0)::float8 AS "revenue"
      FROM "orders" o
      WHERE o."createdAt" >= ${range.start}
        AND o."createdAt" <= ${range.end}
        AND o."isPaid" = true
        AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private async getTopProducts(
    range: AnalyticsDateRange,
  ): Promise<ProductRow[]> {
    return this.prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      SELECT
        p."id" AS "id",
        p."name" AS "name",
        c."name" AS "categoryName",
        COALESCE(SUM(CASE WHEN o."id" IS NOT NULL THEN oi."quantity" ELSE 0 END), 0)::int AS "sold",
        COALESCE(SUM(CASE WHEN o."id" IS NOT NULL THEN oi."quantity" * oi."price" ELSE 0 END), 0)::float8 AS "revenue"
      FROM "products" p
      INNER JOIN "categories" c ON c."id" = p."categoryId"
      LEFT JOIN "orderItems" oi ON oi."productId" = p."id"
      LEFT JOIN "orders" o ON o."id" = oi."orderId"
        AND o."createdAt" >= ${range.start}
        AND o."createdAt" <= ${range.end}
        AND o."isPaid" = true
        AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
      GROUP BY p."id", p."name", c."name"
      ORDER BY "sold" DESC, "revenue" DESC, p."name" ASC
      LIMIT 10
    `);
  }

  private async getRevenueByCategory(
    range: AnalyticsDateRange,
  ): Promise<CategoryRevenueRow[]> {
    return this.prisma.$queryRaw<CategoryRevenueRow[]>(Prisma.sql`
      SELECT
        c."name" AS "name",
        COALESCE(SUM(CASE WHEN o."id" IS NOT NULL THEN oi."quantity" * oi."price" ELSE 0 END), 0)::float8 AS "revenue"
      FROM "categories" c
      LEFT JOIN "products" p ON p."categoryId" = c."id"
      LEFT JOIN "orderItems" oi ON oi."productId" = p."id"
      LEFT JOIN "orders" o ON o."id" = oi."orderId"
        AND o."createdAt" >= ${range.start}
        AND o."createdAt" <= ${range.end}
        AND o."isPaid" = true
        AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
      GROUP BY c."id", c."name"
      ORDER BY "revenue" DESC, c."name" ASC
    `);
  }

  private async getNewCustomersOverTime(
    range: AnalyticsDateRange,
    grouping: AnalyticsGrouping,
  ): Promise<CountPointRow[]> {
    return this.prisma.$queryRaw<CountPointRow[]>(Prisma.sql`
      SELECT
        DATE_TRUNC(${dateTruncUnit(grouping)}, u."createdAt")::date AS "date",
        COUNT(*)::int AS "count"
      FROM "users" u
      WHERE u."role" = ${Role.USER}
        AND u."createdAt" >= ${range.start}
        AND u."createdAt" <= ${range.end}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
  }

  private async getTopSpenders(
    range: AnalyticsDateRange,
  ): Promise<TopSpenderRow[]> {
    return this.prisma.$queryRaw<TopSpenderRow[]>(Prisma.sql`
      SELECT
        u."id" AS "id",
        u."name" AS "name",
        u."email" AS "email",
        COUNT(o."id")::int AS "ordersCount",
        COALESCE(SUM(o."totalOrderPrice"), 0)::float8 AS "totalSpent"
      FROM "users" u
      INNER JOIN "orders" o ON o."userId" = u."id"
      WHERE u."role" = ${Role.USER}
        AND o."createdAt" >= ${range.start}
        AND o."createdAt" <= ${range.end}
        AND o."isPaid" = true
        AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
      GROUP BY u."id", u."name", u."email"
      ORDER BY "totalSpent" DESC, "ordersCount" DESC, u."name" ASC
      LIMIT 10
    `);
  }

  private async getCouponRows(range: AnalyticsDateRange): Promise<CouponRow[]> {
    return this.prisma.$queryRaw<CouponRow[]>(Prisma.sql`
      SELECT
        c."id" AS "id",
        c."name" AS "name",
        c."discount"::float8 AS "discountPct",
        c."usedCount"::int AS "usedCount",
        c."maxUsage"::int AS "maxUsage",
        c."expire" AS "expire",
        COUNT(o."id")::int AS "periodRedemptions",
        COALESCE(SUM(o."discountApplied"), 0)::float8 AS "totalDiscountGiven"
      FROM "coupons" c
      LEFT JOIN "orders" o ON o."couponId" = c."id"
        AND o."createdAt" >= ${range.start}
        AND o."createdAt" <= ${range.end}
      GROUP BY c."id", c."name", c."discount", c."usedCount", c."maxUsage", c."expire"
      ORDER BY "totalDiscountGiven" DESC, c."name" ASC
    `);
  }

  private async getGeographyRows(
    range: AnalyticsDateRange,
  ): Promise<GeographyRow[]> {
    return this.prisma.$queryRaw<GeographyRow[]>(Prisma.sql`
      SELECT
        COALESCE(a."governorate", o."anonGovernorate") AS "governorate",
        COUNT(o."id")::int AS "orderCount",
        COALESCE(SUM(
          CASE
            WHEN o."isPaid" = true
              AND o."status" NOT IN (${Prisma.join(EXCLUDED_REVENUE_STATUSES)})
            THEN o."totalOrderPrice"
            ELSE 0
          END
        ), 0)::float8 AS "revenue"
      FROM "orders" o
      LEFT JOIN "addresses" a ON a."id" = o."shippingAddressId"
      WHERE o."createdAt" >= ${range.start}
        AND o."createdAt" <= ${range.end}
        AND COALESCE(a."governorate", o."anonGovernorate") IS NOT NULL
      GROUP BY COALESCE(a."governorate", o."anonGovernorate")
      ORDER BY "orderCount" DESC, "governorate" ASC
    `);
  }
}
