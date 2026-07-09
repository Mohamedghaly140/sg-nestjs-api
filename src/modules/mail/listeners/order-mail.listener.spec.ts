/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '../../../generated/prisma/client';
import { OrderCreatedEvent } from '../../orders/events/order-created.event';
import { OrderPaidEvent } from '../../orders/events/order-paid.event';
import { OrderStatusChangedEvent } from '../../orders/events/order-status-changed.event';
import type { OrdersService, OrderForMail } from '../../orders/orders.service';
import { MailService } from '../mail.service';
import { OrderMailListener } from './order-mail.listener';

describe('OrderMailListener', () => {
  const registeredOrder: OrderForMail = {
    id: 'order_1',
    humanOrderId: 'ORD-000001',
    status: OrderStatus.PENDING,
    paymentMethod: PaymentMethod.CASH,
    isPaid: false,
    totalOrderPrice: new Prisma.Decimal('145.00'),
    shippingFees: new Prisma.Decimal('65.00'),
    discountApplied: new Prisma.Decimal('0.00'),
    guestToken: null,
    anonName: null,
    anonEmail: null,
    user: { email: 'customer@test.dev', name: 'Customer' },
    items: [
      {
        quantity: 1,
        price: new Prisma.Decimal('80.00'),
        product: { name: 'Dress' },
      },
    ],
  };
  const guestOrder: OrderForMail = {
    ...registeredOrder,
    id: 'order_2',
    humanOrderId: 'ORD-000002',
    user: null,
    anonName: 'Guest Customer',
    anonEmail: 'guest@test.dev',
    guestToken: 'guest-token',
  };
  const ordersService = {
    getOrderForMail: jest.fn(),
  };
  const mailService = {
    sendEmail: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };
  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
  };
  const listener = new OrderMailListener(
    ordersService as unknown as OrdersService,
    mailService as unknown as MailService,
    config as unknown as ConfigService,
    logger as unknown as Logger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    ordersService.getOrderForMail.mockResolvedValue(registeredOrder);
    mailService.sendEmail.mockResolvedValue(undefined);
    config.get.mockImplementation((key: string) => {
      const values: Record<string, string | number> = {
        'mail.storefrontUrl': 'https://storefront.test',
        'cart.guestTokenTtlDays': 30,
      };
      return values[key];
    });
  });

  it('sends registered order confirmations to the user email', async () => {
    await listener.handleOrderCreated(new OrderCreatedEvent('order_1'));

    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@test.dev',
        subject: expect.stringContaining('ORD-000001'),
      }),
    );
  });

  it('sends guest order confirmations with a claim link', async () => {
    ordersService.getOrderForMail.mockResolvedValueOnce(guestOrder);

    await listener.handleOrderCreated(new OrderCreatedEvent('order_2'));

    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'guest@test.dev',
        text: expect.stringContaining(
          'https://storefront.test/orders/claim?token=guest-token',
        ),
      }),
    );
  });

  it('skips guest order confirmations when the storefront URL is unset', async () => {
    ordersService.getOrderForMail.mockResolvedValueOnce(guestOrder);
    config.get.mockImplementation((key: string) =>
      key === 'cart.guestTokenTtlDays' ? 30 : undefined,
    );

    await listener.handleOrderCreated(new OrderCreatedEvent('order_2'));

    expect(mailService.sendEmail).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'order.created',
        reason: 'missing storefront url',
      }),
      'Skipping transactional email',
    );
  });

  it('sends payment receipts to registered and guest purchasers', async () => {
    await listener.handleOrderPaid(new OrderPaidEvent('order_1'));
    ordersService.getOrderForMail.mockResolvedValueOnce(guestOrder);
    await listener.handleOrderPaid(new OrderPaidEvent('order_2'));

    expect(mailService.sendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: 'customer@test.dev' }),
    );
    expect(mailService.sendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: 'guest@test.dev' }),
    );
  });

  it('filters status-change emails by the event status payload', async () => {
    await listener.handleOrderStatusChanged(
      new OrderStatusChangedEvent('order_1', OrderStatus.PROCESSING),
    );

    expect(ordersService.getOrderForMail).not.toHaveBeenCalled();
    expect(mailService.sendEmail).not.toHaveBeenCalled();

    for (const status of [
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ]) {
      await listener.handleOrderStatusChanged(
        new OrderStatusChangedEvent('order_1', status),
      );
    }

    expect(mailService.sendEmail).toHaveBeenCalledTimes(4);
  });
});
