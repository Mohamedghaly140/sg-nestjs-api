/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CartCleanupCron } from './cart-cleanup.cron';

describe('CartCleanupCron', () => {
  const prisma = {
    cart: {
      deleteMany: jest.fn(),
    },
  };
  const cron = new CartCleanupCron(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.cart.deleteMany.mockResolvedValue({ count: 3 });
  });

  it('deletes only expired guest carts, never user carts', async () => {
    await cron.purgeExpiredCarts();

    expect(prisma.cart.deleteMany).toHaveBeenCalledWith({
      where: {
        sessionToken: { not: null },
        expiresAt: { lt: expect.any(Date) },
      },
    });
  });
});
