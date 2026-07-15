/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, ProductStatus, Role } from '../../generated/prisma/client';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const prisma = {
    product: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    review: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(
      async (callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(prisma as never),
    ),
  };
  const service = new ReviewsService(prisma as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(prisma as never),
    );
  });

  it('recomputes rating aggregates with round-half-up to one decimal', async () => {
    prisma.product.findFirst.mockResolvedValueOnce({ id: 'prod_1' });
    prisma.review.findUnique.mockResolvedValueOnce(null);
    prisma.review.create.mockResolvedValueOnce({
      id: 'review_1',
      title: '',
      ratings: new Prisma.Decimal('4.5'),
      user: { id: 'user_1', name: 'Mona' },
      createdAt: new Date('2026-07-08T10:00:00.000Z'),
    });
    prisma.review.aggregate.mockResolvedValueOnce({
      _count: 2,
      _avg: { ratings: new Prisma.Decimal('4.25') },
    });
    prisma.product.update.mockResolvedValueOnce({});

    await service.createReview('prod_1', 'user_1', { ratings: 4.5 });

    const [createArgs] = prisma.review.create.mock.calls[0] as [
      { data: { title: string } },
    ];
    expect(createArgs.data.title).toBe('');
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: {
        ratingsAverage: new Prisma.Decimal('4.3'),
        ratingsQuantity: 2,
      },
    });
  });

  it('serializes concurrent rating recomputes for the same product', async () => {
    const productId = 'prod_parallel';
    const fakePrisma = createConcurrentRatingsPrisma(productId);
    const parallelService = new ReviewsService(fakePrisma as never);

    await Promise.all([
      parallelService.createReview(productId, 'user_1', { ratings: 4 }),
      parallelService.createReview(productId, 'user_2', { ratings: 5 }),
    ]);

    expect(fakePrisma.lockedProductIds).toEqual([productId, productId]);
    expect(fakePrisma.productAggregate).toEqual({
      ratingsAverage: '4.5',
      ratingsQuantity: 2,
    });
  });

  it('sets aggregate average to null when the last review is deleted', async () => {
    prisma.review.findUnique.mockResolvedValueOnce({
      id: 'review_1',
      userId: 'user_1',
      productId: 'prod_1',
    });
    prisma.review.delete.mockResolvedValueOnce({});
    prisma.review.aggregate.mockResolvedValueOnce({
      _count: 0,
      _avg: { ratings: null },
    });
    prisma.product.update.mockResolvedValueOnce({});

    await service.deleteReview('review_1', {
      id: 'user_1',
      email: 'user@example.test',
      role: Role.USER,
      active: true,
    });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { ratingsAverage: null, ratingsQuantity: 0 },
    });
  });

  it('rejects duplicate reviews before insert and preserves REVIEW_EXISTS on P2002 races', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod_1' });
    prisma.review.findUnique
      .mockResolvedValueOnce({ id: 'existing_review' })
      .mockResolvedValueOnce(null);

    await expect(
      service.createReview('prod_1', 'user_1', { ratings: 4 }),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_EXISTS' } });

    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.createReview('prod_1', 'user_1', { ratings: 4 }),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_EXISTS' } });
  });

  it('requires an ACTIVE product when creating a review', async () => {
    prisma.product.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.createReview('prod_1', 'user_1', { ratings: 4 }),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } });
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('allows only the owner to update a review', async () => {
    prisma.review.findUnique.mockResolvedValueOnce({
      id: 'review_1',
      userId: 'other_user',
      productId: 'prod_1',
    });

    await expect(
      service.updateReview('review_1', 'user_1', { ratings: 3.5 }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it('allows admins, but not unrelated users, to delete someone else review', async () => {
    prisma.review.findUnique
      .mockResolvedValueOnce({
        id: 'review_1',
        userId: 'owner_user',
        productId: 'prod_1',
      })
      .mockResolvedValueOnce({
        id: 'review_1',
        userId: 'owner_user',
        productId: 'prod_1',
      });
    prisma.review.delete.mockResolvedValue({});
    prisma.review.aggregate.mockResolvedValue({
      _count: 1,
      _avg: { ratings: new Prisma.Decimal('5') },
    });
    prisma.product.update.mockResolvedValue({});

    await expect(
      service.deleteReview('review_1', {
        id: 'user_1',
        email: 'user@example.test',
        role: Role.USER,
        active: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });

    await expect(
      service.deleteReview('review_1', {
        id: 'admin_1',
        email: 'admin@example.test',
        role: Role.ADMIN,
        active: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('returns 404 when updating or deleting a missing review', async () => {
    prisma.review.findUnique.mockResolvedValue(null);

    await expect(
      service.updateReview('missing', 'user_1', { title: 'New' }),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } });

    await expect(
      service.deleteReview('missing', {
        id: 'user_1',
        email: 'user@example.test',
        role: Role.USER,
        active: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } });
  });

  it('lists product reviews with pagination metadata', async () => {
    prisma.review.findMany.mockResolvedValueOnce([]);
    prisma.review.count.mockResolvedValueOnce(0);

    await expect(
      service.listProductReviews('prod_1', { page: 2, limit: 10 }),
    ).resolves.toEqual({
      data: [],
      meta: {
        page: 2,
        limit: 10,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: true,
      },
    });
    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'prod_1' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('checks duplicate reviews against active products only', async () => {
    await service.createReview('prod_1', 'user_1', { ratings: 5 }).catch(() => {
      return undefined;
    });

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'prod_1', status: ProductStatus.ACTIVE },
      select: { id: true },
    });
  });
});

function createConcurrentRatingsPrisma(productId: string) {
  type ReviewRow = {
    productId: string;
    ratings: Prisma.Decimal;
  };
  type TransactionState = {
    pendingReviews: ReviewRow[];
    hasProductLock: boolean;
  };

  const committedReviews: ReviewRow[] = [];
  const aggregateWaiters: Array<() => void> = [];
  const lockWaiters: Array<() => void> = [];
  const lockedProductIds: string[] = [];
  const transactionState = new AsyncLocalStorage<TransactionState>();
  let productLockHeld = false;
  let productAggregate = {
    ratingsAverage: null as string | null,
    ratingsQuantity: 0,
  };

  function currentTransactionState() {
    const state = transactionState.getStore();
    if (!state) {
      throw new Error('Expected an active transaction state');
    }
    return state;
  }

  async function waitForUnlockedProduct(state: TransactionState) {
    if (productLockHeld) {
      await new Promise<void>((resolve) => lockWaiters.push(resolve));
    }
    productLockHeld = true;
    state.hasProductLock = true;
    lockedProductIds.push(productId);
  }

  function releaseProductLock() {
    productLockHeld = false;
    lockWaiters.shift()?.();
  }

  async function synchronizeUnlockedAggregates(state: TransactionState) {
    if (state.hasProductLock) {
      return;
    }

    await new Promise<void>((resolve) => {
      aggregateWaiters.push(resolve);
      if (aggregateWaiters.length === 2) {
        aggregateWaiters.splice(0).forEach((release) => release());
      }
    });
  }

  const fakePrisma = {
    lockedProductIds,
    get productAggregate() {
      return productAggregate;
    },
    product: {
      findFirst: jest.fn().mockResolvedValue({ id: productId }),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            ratingsAverage: Prisma.Decimal | null;
            ratingsQuantity: number;
          };
        }) => {
          productAggregate = {
            ratingsAverage: data.ratingsAverage?.toString() ?? null,
            ratingsQuantity: data.ratingsQuantity,
          };
          return {};
        },
      ),
    },
    review: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(
        async ({
          data,
        }: {
          data: { productId: string; userId: string; ratings: number };
        }) => {
          const state = currentTransactionState();
          const review = {
            productId: data.productId,
            ratings: new Prisma.Decimal(data.ratings),
          };
          state.pendingReviews.push(review);
          return {
            id: `review_${data.userId}`,
            title: '',
            ratings: review.ratings,
            user: { id: data.userId, name: data.userId },
            createdAt: new Date('2026-07-08T10:00:00.000Z'),
          };
        },
      ),
      aggregate: jest.fn(async () => {
        const state = currentTransactionState();
        await synchronizeUnlockedAggregates(state);
        const visibleReviews = [
          ...committedReviews,
          ...state.pendingReviews,
        ].filter((review) => review.productId === productId);
        const sum = visibleReviews.reduce(
          (total, review) => total.plus(review.ratings),
          new Prisma.Decimal(0),
        );
        return {
          _count: visibleReviews.length,
          _avg: {
            ratings:
              visibleReviews.length > 0
                ? sum.dividedBy(visibleReviews.length)
                : null,
          },
        };
      }),
    },
    $queryRaw: jest.fn(async () => {
      await waitForUnlockedProduct(currentTransactionState());
      return [{ id: productId }];
    }),
    $transaction: jest.fn(async (callback: (tx: never) => unknown) => {
      const state: TransactionState = {
        pendingReviews: [],
        hasProductLock: false,
      };
      return transactionState.run(state, async () => {
        try {
          const result = await callback(fakePrisma as never);
          committedReviews.push(...state.pendingReviews);
          return result;
        } finally {
          if (state.hasProductLock) {
            releaseProductLock();
          }
        }
      });
    }),
  };

  return fakePrisma;
}
