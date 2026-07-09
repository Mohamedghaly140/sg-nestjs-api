import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { OrderStatus, PaymentMethod } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatusChangedEvent } from './events/order-status-changed.event';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderExpiryCron {
  private readonly logger = new Logger(OrderExpiryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron('*/15 * * * *')
  async expireUnpaidCardOrders(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.cardOrderExpiryMinutes() * 60 * 1000,
    );
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CARD,
        isPaid: false,
        createdAt: { lt: cutoff },
      },
      select: { id: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    for (const order of orders) {
      try {
        const cancelled = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${order.id} FOR UPDATE`;
          const lockedOrder = await this.ordersService.findOrderForRestore(
            tx,
            order.id,
          );
          // Re-check status after acquiring the lock: a concurrent cron run
          // (overlapping deploy, accidental multi-replica) may have already
          // restored and cancelled this order while we were blocked on the
          // lock, so the row we just read may no longer be PENDING. Restoring
          // again would double-increment stock and double-release the coupon.
          if (lockedOrder.status !== OrderStatus.PENDING) {
            return false;
          }
          await this.ordersService.restoreOrderInventory(tx, lockedOrder);
          await tx.order.update({
            where: { id: order.id },
            data: { status: OrderStatus.CANCELLED },
          });
          return true;
        });
        if (cancelled) {
          this.eventEmitter.emit(
            'order.status_changed',
            new OrderStatusChangedEvent(order.id, OrderStatus.CANCELLED),
          );
        }
      } catch (error: unknown) {
        this.logger.error(
          { err: error, orderId: order.id },
          'Failed to expire unpaid CARD order',
        );
      }
    }
  }

  @Cron('30 4 * * *')
  async purgeExpiredGuestTokens(): Promise<void> {
    const result = await this.prisma.order.updateMany({
      where: {
        guestToken: { not: null },
        guestTokenExpiresAt: { lt: new Date() },
      },
      data: { guestToken: null },
    });

    this.logger.log(
      { purgedCount: result.count },
      'Purged expired guest order tokens',
    );
  }

  private cardOrderExpiryMinutes(): number {
    return (
      this.configService.get<number>('orders.cardOrderExpiryMinutes') ?? 60
    );
  }
}
