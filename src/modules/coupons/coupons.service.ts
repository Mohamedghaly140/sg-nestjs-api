import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { Coupon, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import type { CartServiceIdentity } from '../cart/interfaces/cart-service-identity.interface';
import {
  ValidateCouponDto,
  ValidateCouponResponseDto,
} from './dto/validate-coupon.dto';

type CouponIdentity = { userId?: string; anonEmail?: string };

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
  ) {}

  async validateCoupon(
    dto: ValidateCouponDto,
    identity: CartServiceIdentity,
    itemsSubtotal?: string,
  ): Promise<ValidateCouponResponseDto> {
    const coupon = await this.findEligibleCoupon(this.prisma, dto.code, {
      userId: identity.userId,
      anonEmail: dto.email,
    });
    const subtotal =
      itemsSubtotal ??
      (await this.cartService.getCart(identity)).cart.totalPriceAfterDiscount;
    const discountApplied = this.computeDiscount(subtotal, coupon.discount);

    return {
      valid: true,
      code: coupon.name,
      discountPercent: this.formatDecimal(coupon.discount),
      discountApplied: this.formatDecimal(discountApplied),
      itemsSubtotal: this.formatDecimal(subtotal),
    };
  }

  async findEligibleCoupon(
    tx: Prisma.TransactionClient,
    code: string,
    identity: CouponIdentity,
  ): Promise<Coupon> {
    const coupon = await tx.coupon.findUnique({
      where: { name: code.trim().toUpperCase() },
    });
    if (!coupon) {
      throw new NotFoundException({
        code: ERROR_CODES.RESOURCE_NOT_FOUND,
        message: 'Coupon not found',
      });
    }

    this.assertActive(coupon);
    this.assertNotExpired(coupon);
    this.assertNotExhausted(coupon);
    await this.assertUserLimit(tx, coupon, identity);

    return coupon;
  }

  /**
   * Commit point for coupon usage. Locks the coupon row first (mirrors
   * cart.service.ts's lockCart/lockProduct pattern) so the per-user count
   * below observes any concurrent transaction's already-committed
   * CouponUsage row — this requires READ COMMITTED (the default; do not run
   * this inside a stricter isolation level without re-checking this
   * guarantee). The conditional updateMany afterwards keeps the global
   * usedCount/maxUsage race-safe even though the lock alone already
   * serializes concurrent callers for this coupon.
   */
  async consumeCoupon(
    tx: Prisma.TransactionClient,
    params: {
      couponId: string;
      orderId: string;
      userId?: string;
      anonEmail?: string;
    },
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "coupons" WHERE id = ${params.couponId} FOR UPDATE`;

    const coupon = await tx.coupon.findUniqueOrThrow({
      where: { id: params.couponId },
    });
    this.assertActive(coupon);
    this.assertNotExpired(coupon);
    this.assertNotExhausted(coupon);
    await this.assertUserLimit(tx, coupon, {
      userId: params.userId,
      anonEmail: params.anonEmail,
    });

    const result = await tx.coupon.updateMany({
      where: {
        id: params.couponId,
        OR: [{ maxUsage: 0 }, { usedCount: { lt: tx.coupon.fields.maxUsage } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    if (result.count === 0) {
      throw this.exhausted();
    }

    await tx.couponUsage.create({
      data: {
        couponId: params.couponId,
        orderId: params.orderId,
        userId: params.userId,
        anonEmail: params.anonEmail,
      },
    });
  }

  async releaseCoupon(
    tx: Prisma.TransactionClient,
    couponId: string,
    orderId: string,
  ): Promise<void> {
    const result = await tx.couponUsage.deleteMany({
      where: { couponId, orderId },
    });
    if (result.count === 0) {
      return;
    }

    await tx.coupon.update({
      where: { id: couponId },
      data: { usedCount: { decrement: 1 } },
    });
  }

  private assertActive(coupon: Coupon): void {
    if (coupon.isActive) {
      return;
    }

    throw new UnprocessableEntityException({
      code: ERROR_CODES.COUPON_INACTIVE,
      message: 'Coupon is inactive',
    });
  }

  private assertNotExpired(coupon: Coupon): void {
    if (coupon.expire.getTime() > Date.now()) {
      return;
    }

    throw new UnprocessableEntityException({
      code: ERROR_CODES.COUPON_EXPIRED,
      message: 'Coupon has expired',
    });
  }

  private assertNotExhausted(coupon: Coupon): void {
    if (coupon.maxUsage === 0 || coupon.usedCount < coupon.maxUsage) {
      return;
    }

    throw this.exhausted();
  }

  private async assertUserLimit(
    tx: Prisma.TransactionClient,
    coupon: Coupon,
    identity: CouponIdentity,
  ): Promise<void> {
    if (
      coupon.perUserLimit === 0 ||
      (!identity.userId && !identity.anonEmail)
    ) {
      return;
    }

    const usedCount = await tx.couponUsage.count({
      where: {
        couponId: coupon.id,
        ...(identity.userId
          ? { userId: identity.userId }
          : { anonEmail: identity.anonEmail }),
      },
    });
    if (usedCount < coupon.perUserLimit) {
      return;
    }

    throw new ConflictException({
      code: ERROR_CODES.COUPON_USER_LIMIT,
      message: 'Coupon usage limit reached for this customer',
    });
  }

  private computeDiscount(
    itemsSubtotal: string | number | Prisma.Decimal,
    discountPercent: string | number | Prisma.Decimal,
  ): Prisma.Decimal {
    return new Prisma.Decimal(itemsSubtotal)
      .mul(discountPercent)
      .div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  private formatDecimal(value: string | number | Prisma.Decimal): string {
    return new Prisma.Decimal(value).toFixed(2);
  }

  private exhausted(): ConflictException {
    return new ConflictException({
      code: ERROR_CODES.COUPON_EXHAUSTED,
      message: 'Coupon usage limit has been reached',
    });
  }
}
