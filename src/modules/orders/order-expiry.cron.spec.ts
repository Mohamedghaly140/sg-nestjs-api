/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderExpiryCron } from './order-expiry.cron';
import type { OrdersService } from './orders.service';

describe('OrderExpiryCron', () => {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      update: jest.fn(),
    },
  };
  const prisma = {
    order: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(
      <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    ),
  };
  const ordersService = {
    findOrderForRestore: jest.fn(),
    restoreOrderInventory: jest.fn(),
  };
  const configService = { get: jest.fn() };
  const eventEmitter = { emit: jest.fn() };
  const cron = new OrderExpiryCron(
    prisma as unknown as PrismaService,
    ordersService as unknown as OrdersService,
    configService as unknown as ConfigService,
    eventEmitter as unknown as EventEmitter2,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.order.findMany.mockResolvedValue([{ id: 'order_1' }]);
    prisma.order.updateMany.mockResolvedValue({ count: 2 });
    ordersService.findOrderForRestore.mockResolvedValue({
      id: 'order_1',
      couponId: 'coupon_1',
      isPaid: false,
      items: [],
    });
    ordersService.restoreOrderInventory.mockResolvedValue(undefined);
    configService.get.mockReturnValue(undefined);
  });

  it('expires unpaid card orders one transaction at a time', async () => {
    await cron.expireUnpaidCardOrders();

    expect(ordersService.restoreOrderInventory).toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { status: OrderStatus.CANCELLED },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.status_changed',
      expect.objectContaining({
        orderId: 'order_1',
        status: OrderStatus.CANCELLED,
      }),
    );
  });

  it('purges expired guest tokens', async () => {
    await cron.purgeExpiredGuestTokens();

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        guestToken: { not: null },
        guestTokenExpiresAt: { lt: expect.any(Date) },
      },
      data: { guestToken: null },
    });
  });
});
