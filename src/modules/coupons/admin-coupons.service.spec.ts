/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AdminCouponsService } from './admin-coupons.service';

describe('AdminCouponsService', () => {
  const prisma = {
    coupon: {
      fields: { maxUsage: 'maxUsage_field_ref' },
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new AdminCouponsService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.coupon.findMany.mockResolvedValue([]);
    prisma.coupon.count.mockResolvedValue(0);
  });

  it.each([
    [
      'active',
      {
        isActive: true,
        expire: expect.objectContaining({ gt: expect.any(Date) }),
        OR: [{ maxUsage: 0 }, { usedCount: { lt: 'maxUsage_field_ref' } }],
      },
    ],
    ['expired', { expire: expect.objectContaining({ lte: expect.any(Date) }) }],
    [
      'exhausted',
      { maxUsage: { gt: 0 }, usedCount: { gte: 'maxUsage_field_ref' } },
    ],
    ['deactivated', { isActive: false }],
  ])(
    'builds the %s lifecycle status where-clause',
    async (status, expected) => {
      await service.listCoupons({
        page: 1,
        limit: 20,
        status: status as never,
      });

      expect(prisma.coupon.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expected }),
      );
    },
  );

  it('combines search with pagination and ordering', async () => {
    await service.listCoupons({ page: 2, limit: 10, search: 'save' });

    expect(prisma.coupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: { contains: 'save', mode: 'insensitive' } },
        skip: 10,
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    );
    await expect(
      service.listCoupons({ page: 2, limit: 10 }),
    ).resolves.toMatchObject({
      meta: { page: 2, limit: 10, totalItems: 0, hasPrev: true },
    });
  });

  it('creates, updates, and deactivates coupons through Prisma', async () => {
    prisma.coupon.create.mockResolvedValueOnce({ id: 'coupon_1' });
    prisma.coupon.update
      .mockResolvedValueOnce({ id: 'coupon_1' })
      .mockResolvedValueOnce({ id: 'coupon_1', isActive: false });

    await expect(
      service.createCoupon({
        name: 'SAVE20',
        discount: 20,
        maxUsage: 0,
        perUserLimit: 1,
        expire: new Date('2027-01-01T00:00:00.000Z'),
        isActive: true,
      }),
    ).resolves.toEqual({ id: 'coupon_1' });
    await expect(
      service.updateCoupon('coupon_1', {
        expire: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).resolves.toEqual({ id: 'coupon_1' });
    await expect(service.deactivateCoupon('coupon_1')).resolves.toEqual({
      id: 'coupon_1',
      isActive: false,
    });
  });

  it('blocks deleting used coupons with COUPON_IN_USE', async () => {
    prisma.coupon.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.coupon.findUniqueOrThrow.mockResolvedValueOnce({ id: 'coupon_1' });

    await expect(service.deleteCoupon('coupon_1')).rejects.toMatchObject({
      response: { code: 'COUPON_IN_USE' },
    });
    expect(prisma.coupon.deleteMany).toHaveBeenCalledWith({
      where: { id: 'coupon_1', usedCount: 0 },
    });
  });

  it('deletes unused coupons via a conditional deleteMany', async () => {
    prisma.coupon.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.deleteCoupon('coupon_1')).resolves.toBeUndefined();
    expect(prisma.coupon.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('lets Prisma map missing coupons to 404 on delete', async () => {
    prisma.coupon.deleteMany.mockResolvedValueOnce({ count: 0 });
    prisma.coupon.findUniqueOrThrow.mockRejectedValueOnce(new Error('P2025'));

    await expect(service.deleteCoupon('missing')).rejects.toThrow('P2025');
  });
});
