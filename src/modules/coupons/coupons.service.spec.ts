import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { CartService } from '../cart/cart.service';
import { CouponsService } from './coupons.service';

describe('CouponsService', () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  const baseCoupon = {
    id: 'coupon_1',
    name: 'SAVE20',
    discount: new Prisma.Decimal('20.00'),
    usedCount: 0,
    maxUsage: 10,
    perUserLimit: 1,
    expire: future,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    $queryRaw: jest.fn(),
    coupon: {
      fields: { maxUsage: 'maxUsage_field_ref' },
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    couponUsage: {
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const cartService = {
    getCart: jest.fn(),
  };
  const service = new CouponsService(
    prisma as never,
    cartService as unknown as CartService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.coupon.findUnique.mockResolvedValue(baseCoupon);
    prisma.coupon.findUniqueOrThrow.mockResolvedValue(baseCoupon);
    prisma.couponUsage.count.mockResolvedValue(0);
    cartService.getCart.mockResolvedValue({
      cart: { totalPriceAfterDiscount: '100.00' },
    });
  });

  it('validates eligible coupons and rounds discount math', async () => {
    prisma.coupon.findUnique.mockResolvedValueOnce({
      ...baseCoupon,
      discount: new Prisma.Decimal('12.50'),
    });
    cartService.getCart.mockResolvedValueOnce({
      cart: { totalPriceAfterDiscount: '99.99' },
    });

    await expect(
      service.validateCoupon({ code: 'SAVE20' }, { userId: 'user_1' }),
    ).resolves.toMatchObject({
      valid: true,
      code: 'SAVE20',
      discountPercent: '12.50',
      discountApplied: '12.50',
      itemsSubtotal: '99.99',
    });
  });

  it('returns a valid zero preview for an empty cart', async () => {
    cartService.getCart.mockResolvedValueOnce({
      cart: { totalPriceAfterDiscount: '0.00' },
    });

    await expect(
      service.validateCoupon({ code: 'SAVE20' }, {}),
    ).resolves.toMatchObject({
      valid: true,
      discountApplied: '0.00',
      itemsSubtotal: '0.00',
    });
    expect(prisma.couponUsage.count).not.toHaveBeenCalled();
  });

  it('preserves validation precedence', async () => {
    prisma.coupon.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.validateCoupon({ code: 'MISSING' }, {}),
    ).rejects.toMatchObject({
      response: { code: 'RESOURCE_NOT_FOUND' },
    });

    prisma.coupon.findUnique.mockResolvedValueOnce({
      ...baseCoupon,
      isActive: false,
      expire: past,
      usedCount: 10,
    });
    await expect(
      service.validateCoupon({ code: 'SAVE20' }, {}),
    ).rejects.toMatchObject({
      response: { code: 'COUPON_INACTIVE' },
    });

    prisma.coupon.findUnique.mockResolvedValueOnce({
      ...baseCoupon,
      expire: past,
    });
    await expect(
      service.validateCoupon({ code: 'SAVE20' }, {}),
    ).rejects.toMatchObject({
      response: { code: 'COUPON_EXPIRED' },
    });

    prisma.coupon.findUnique.mockResolvedValueOnce({
      ...baseCoupon,
      usedCount: 10,
      maxUsage: 10,
    });
    await expect(
      service.validateCoupon({ code: 'SAVE20' }, {}),
    ).rejects.toMatchObject({
      response: { code: 'COUPON_EXHAUSTED' },
    });
  });

  it('checks per-user limits by user id or email and skips missing identity', async () => {
    prisma.couponUsage.count.mockResolvedValueOnce(1);
    await expect(
      service.validateCoupon({ code: 'SAVE20' }, { userId: 'user_1' }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_USER_LIMIT' } });
    expect(prisma.couponUsage.count).toHaveBeenCalledWith({
      where: { couponId: 'coupon_1', userId: 'user_1' },
    });

    prisma.couponUsage.count.mockResolvedValueOnce(1);
    await expect(
      service.validateCoupon(
        { code: 'SAVE20', email: 'guest@example.com' },
        {},
      ),
    ).rejects.toMatchObject({ response: { code: 'COUPON_USER_LIMIT' } });
    expect(prisma.couponUsage.count).toHaveBeenCalledWith({
      where: { couponId: 'coupon_1', anonEmail: 'guest@example.com' },
    });

    prisma.couponUsage.count.mockClear();
    await service.validateCoupon({ code: 'SAVE20' }, {});
    expect(prisma.couponUsage.count).not.toHaveBeenCalled();
  });

  it('treats maxUsage zero and perUserLimit zero as unlimited', async () => {
    prisma.coupon.findUnique.mockResolvedValueOnce({
      ...baseCoupon,
      usedCount: 999,
      maxUsage: 0,
      perUserLimit: 0,
    });

    await expect(
      service.validateCoupon({ code: 'SAVE20' }, { userId: 'user_1' }),
    ).resolves.toMatchObject({ valid: true });
    expect(prisma.couponUsage.count).not.toHaveBeenCalled();
  });

  it('consumeCoupon uses a guarded atomic increment and maps race losers', async () => {
    prisma.coupon.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.consumeCoupon(prisma as never, {
        couponId: 'coupon_1',
        orderId: 'order_1',
      }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_EXHAUSTED' } });
    expect(prisma.couponUsage.create).not.toHaveBeenCalled();

    prisma.coupon.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.consumeCoupon(prisma as never, {
      couponId: 'coupon_1',
      orderId: 'order_2',
      userId: 'user_1',
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.coupon.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'coupon_1' },
    });
    expect(prisma.coupon.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 'coupon_1',
        OR: [{ maxUsage: 0 }, { usedCount: { lt: 'maxUsage_field_ref' } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    expect(prisma.couponUsage.create).toHaveBeenCalledWith({
      data: {
        couponId: 'coupon_1',
        orderId: 'order_2',
        userId: 'user_1',
        anonEmail: undefined,
      },
    });
  });

  it('consumeCoupon re-checks the per-user limit under the row lock', async () => {
    prisma.couponUsage.count.mockResolvedValueOnce(1);

    await expect(
      service.consumeCoupon(prisma as never, {
        couponId: 'coupon_1',
        orderId: 'order_1',
        userId: 'user_1',
      }),
    ).rejects.toMatchObject({ response: { code: 'COUPON_USER_LIMIT' } });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.coupon.updateMany).not.toHaveBeenCalled();
    expect(prisma.couponUsage.create).not.toHaveBeenCalled();
  });

  it('releaseCoupon is a no-op without a usage row and decrements when found', async () => {
    prisma.couponUsage.deleteMany.mockResolvedValueOnce({ count: 0 });
    await service.releaseCoupon(prisma as never, 'coupon_1', 'order_1');
    expect(prisma.coupon.update).not.toHaveBeenCalled();

    prisma.couponUsage.deleteMany.mockResolvedValueOnce({ count: 1 });
    await service.releaseCoupon(prisma as never, 'coupon_1', 'order_1');
    expect(prisma.coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon_1' },
      data: { usedCount: { decrement: 1 } },
    });
  });

  it('exposes ConflictException instances for coupon conflicts', async () => {
    prisma.coupon.findUnique.mockResolvedValueOnce({
      ...baseCoupon,
      usedCount: 10,
      maxUsage: 10,
    });

    await expect(
      service.findEligibleCoupon(prisma as never, 'SAVE20', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
