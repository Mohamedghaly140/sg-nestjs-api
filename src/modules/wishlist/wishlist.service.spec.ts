/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma, ProductStatus } from '../../generated/prisma/client';
import { WishlistService } from './wishlist.service';

describe('WishlistService', () => {
  const prisma = {
    product: {
      findUnique: jest.fn(),
    },
    userWishlist: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new WishlistService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('checks product existence and idempotently upserts without changing addedAt', async () => {
    prisma.product.findUnique.mockResolvedValueOnce({ id: 'prod_1' });
    prisma.userWishlist.upsert.mockResolvedValueOnce({});

    await expect(service.add('user_1', 'prod_1')).resolves.toEqual({
      added: true,
    });

    expect(prisma.userWishlist.upsert).toHaveBeenCalledWith({
      where: { userId_productId: { userId: 'user_1', productId: 'prod_1' } },
      create: { userId: 'user_1', productId: 'prod_1' },
      update: {},
    });
  });

  it('returns 404 when adding a missing product', async () => {
    prisma.product.findUnique.mockResolvedValueOnce(null);

    await expect(service.add('user_1', 'missing')).rejects.toMatchObject({
      response: { code: 'RESOURCE_NOT_FOUND' },
    });
    expect(prisma.userWishlist.upsert).not.toHaveBeenCalled();
  });

  it('removes wishlist rows idempotently', async () => {
    prisma.userWishlist.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.remove('user_1', 'prod_1')).resolves.toBeUndefined();
    expect(prisma.userWishlist.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', productId: 'prod_1' },
    });
  });

  it('lists newest wishlist items with availability and strips product status', async () => {
    const addedAt = new Date('2026-07-08T10:00:00.000Z');
    prisma.userWishlist.findMany.mockResolvedValueOnce([
      {
        addedAt,
        product: {
          id: 'prod_1',
          name: 'Dress',
          slug: 'dress',
          imageUrl: 'https://example.test/dress.jpg',
          price: new Prisma.Decimal('100'),
          discount: new Prisma.Decimal('0'),
          priceAfterDiscount: new Prisma.Decimal('100'),
          ratingsAverage: null,
          ratingsQuantity: 0,
          featured: false,
          sizes: ['S'],
          colors: ['Black'],
          quantity: 3,
          status: ProductStatus.ACTIVE,
        },
      },
      {
        addedAt,
        product: {
          id: 'prod_2',
          name: 'Draft Dress',
          slug: 'draft-dress',
          imageUrl: 'https://example.test/draft.jpg',
          price: new Prisma.Decimal('100'),
          discount: new Prisma.Decimal('0'),
          priceAfterDiscount: new Prisma.Decimal('100'),
          ratingsAverage: null,
          ratingsQuantity: 0,
          featured: false,
          sizes: [],
          colors: [],
          quantity: 1,
          status: ProductStatus.DRAFT,
        },
      },
    ]);

    await expect(service.list('user_1')).resolves.toEqual([
      {
        addedAt,
        available: true,
        product: expect.not.objectContaining({ status: expect.any(String) }),
      },
      {
        addedAt,
        available: false,
        product: expect.not.objectContaining({ status: expect.any(String) }),
      },
    ]);
    expect(prisma.userWishlist.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_1' },
        orderBy: { addedAt: 'desc' },
      }),
    );
  });
});
