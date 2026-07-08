import { ConflictException, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import {
  CouponLifecycleStatus,
  QueryAdminCouponsDto,
} from './dto/query-admin-coupons.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

const COUPON_SELECT = {
  id: true,
  name: true,
  discount: true,
  usedCount: true,
  maxUsage: true,
  perUserLimit: true,
  expire: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.CouponSelect;

@Injectable()
export class AdminCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCoupons(query: QueryAdminCouponsDto) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [coupons, totalItems] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        select: COUPON_SELECT,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return {
      data: coupons,
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async createCoupon(dto: CreateCouponDto) {
    return this.prisma.coupon.create({
      data: {
        name: dto.name,
        discount: dto.discount,
        maxUsage: dto.maxUsage,
        perUserLimit: dto.perUserLimit,
        expire: dto.expire,
        isActive: dto.isActive,
      },
      select: COUPON_SELECT,
    });
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    return this.prisma.coupon.update({
      where: { id },
      data: dto,
      select: COUPON_SELECT,
    });
  }

  async deactivateCoupon(id: string): Promise<{ id: string; isActive: false }> {
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, isActive: true },
    }) as Promise<{ id: string; isActive: false }>;
  }

  async deleteCoupon(id: string): Promise<void> {
    const result = await this.prisma.coupon.deleteMany({
      where: { id, usedCount: 0 },
    });
    if (result.count === 1) {
      return;
    }

    // 0 rows deleted: either the coupon doesn't exist (→ 404 via
    // findUniqueOrThrow/PrismaExceptionFilter) or it has been used
    // concurrently since the caller last checked (→ 409 COUPON_IN_USE).
    await this.prisma.coupon.findUniqueOrThrow({
      where: { id },
      select: { id: true },
    });
    throw new ConflictException({
      code: ERROR_CODES.COUPON_IN_USE,
      message:
        'Coupon has been used and cannot be deleted; deactivate it instead',
    });
  }

  private buildWhere(query: QueryAdminCouponsDto): Prisma.CouponWhereInput {
    return {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...this.buildStatusWhere(query.status),
    };
  }

  private buildStatusWhere(
    status: CouponLifecycleStatus | undefined,
  ): Prisma.CouponWhereInput {
    const now = new Date();

    switch (status) {
      case 'active':
        return {
          isActive: true,
          expire: { gt: now },
          OR: [
            { maxUsage: 0 },
            { usedCount: { lt: this.prisma.coupon.fields.maxUsage } },
          ],
        };
      case 'expired':
        return { expire: { lte: now } };
      case 'exhausted':
        return {
          maxUsage: { gt: 0 },
          usedCount: { gte: this.prisma.coupon.fields.maxUsage },
        };
      case 'deactivated':
        return { isActive: false };
      default:
        return {};
    }
  }
}
