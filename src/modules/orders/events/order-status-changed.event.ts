import { OrderStatus } from '../../../generated/prisma/client';

export class OrderStatusChangedEvent {
  constructor(
    public readonly orderId: string,
    public readonly status: OrderStatus,
  ) {}
}
