/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from 'nestjs-pino';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client';
import { AdminOrdersService } from './admin-orders.service';
import type { OrdersService } from './orders.service';

describe('AdminOrdersService', () => {
  const adminOrder = {
    id: 'order_1',
    humanOrderId: 'ORD-000042',
    status: OrderStatus.PENDING,
    paymentMethod: PaymentMethod.CASH,
    shippingFees: new Prisma.Decimal('65.00'),
    totalOrderPrice: new Prisma.Decimal('225.00'),
    discountApplied: new Prisma.Decimal('0.00'),
    isPaid: false,
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
    anonName: null,
    anonPhone: null,
    anonEmail: null,
    anonCountry: null,
    anonGovernorate: null,
    anonCity: null,
    geideaSessionId: null,
    geideaOrderId: null,
    user: {
      id: 'user_1',
      name: 'Customer',
      email: 'c@example.com',
      phone: '+201000000001',
    },
    shippingAddress: null,
    coupon: null,
    items: [
      {
        id: 'item_1',
        productId: 'prod_1',
        quantity: 1,
        color: null,
        size: null,
        price: new Prisma.Decimal('160.00'),
        product: {
          id: 'prod_1',
          name: 'Dress',
          slug: 'dress',
          imageUrl: 'https://example.test/dress.jpg',
        },
      },
    ],
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    product: {
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    ),
  };
  const ordersService = {
    restoreOrderInventory: jest.fn(),
  };
  const eventEmitter = { emit: jest.fn() };
  const logger = { log: jest.fn() };
  const service = new AdminOrdersService(
    prisma as never,
    ordersService as unknown as OrdersService,
    eventEmitter as unknown as EventEmitter2,
    logger as unknown as Logger,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.order.findMany.mockResolvedValue([
      {
        id: 'order_1',
        humanOrderId: 'ORD-000042',
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        isPaid: false,
        totalOrderPrice: new Prisma.Decimal('225.00'),
        createdAt: adminOrder.createdAt,
        anonName: null,
        user: { name: 'Customer' },
        _count: { items: 1 },
      },
    ]);
    tx.order.count.mockResolvedValue(1);
    tx.order.findUnique.mockResolvedValue({
      id: 'order_1',
      status: OrderStatus.PENDING,
      paymentMethod: PaymentMethod.CASH,
      isPaid: false,
      couponId: 'coupon_1',
      items: [{ productId: 'prod_1', quantity: 1 }],
    });
    tx.order.findUniqueOrThrow.mockResolvedValue(adminOrder);
    tx.order.update.mockResolvedValue(adminOrder);
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    ordersService.restoreOrderInventory.mockResolvedValue(undefined);
  });

  it('builds admin list filters and row shape', async () => {
    await expect(
      service.list({
        page: 1,
        limit: 20,
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        isPaid: false,
        search: 'Customer',
      }),
    ).resolves.toMatchObject({
      data: [
        {
          customerName: 'Customer',
          totalOrderPrice: '225.00',
          itemsCount: 1,
        },
      ],
    });
    expect(tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: OrderStatus.PENDING,
          paymentMethod: PaymentMethod.CASH,
          isPaid: false,
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('moves pending orders to processing', async () => {
    await expect(
      service.updateStatus('manager_1', 'order_1', {
        status: OrderStatus.PROCESSING,
      }),
    ).resolves.toMatchObject({ id: 'order_1' });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { status: OrderStatus.PROCESSING, notes: undefined },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.status_changed',
      expect.objectContaining({
        orderId: 'order_1',
        status: OrderStatus.PROCESSING,
      }),
    );
  });

  it('rejects same-status transitions', async () => {
    await expect(
      service.updateStatus('manager_1', 'order_1', {
        status: OrderStatus.PENDING,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels unpaid pending orders through the shared restoration helper', async () => {
    await service.updateStatus('manager_1', 'order_1', {
      status: OrderStatus.CANCELLED,
    });

    expect(ordersService.restoreOrderInventory).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'order_1', couponId: 'coupon_1' }),
    );
  });

  it('requires CASH orders to be paid before delivery', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.SHIPPED,
      paymentMethod: PaymentMethod.CASH,
      isPaid: false,
      couponId: null,
      items: [],
    });

    await expect(
      service.updateStatus('manager_1', 'order_1', {
        status: OrderStatus.DELIVERED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refunds delivered orders by restoring stock and decrementing sold', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.DELIVERED,
      paymentMethod: PaymentMethod.CARD,
      isPaid: true,
      couponId: null,
      items: [{ productId: 'prod_1', quantity: 1 }],
    });

    await service.updateStatus('manager_1', 'order_1', {
      status: OrderStatus.REFUNDED,
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { quantity: { increment: 1 }, sold: { decrement: 1 } },
    });
  });

  it('marks unpaid CASH orders paid and increments sold', async () => {
    await expect(
      service.markPaid('manager_1', 'order_1'),
    ).resolves.toMatchObject({
      id: 'order_1',
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { sold: { increment: 1 } },
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.paid',
      expect.objectContaining({ orderId: 'order_1' }),
    );
  });

  it('returns full admin order detail including coupon and item line totals', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      ...adminOrder,
      coupon: { name: 'SAVE20', discount: new Prisma.Decimal('20.00') },
    });

    await expect(service.get('order_1')).resolves.toMatchObject({
      id: 'order_1',
      itemsSubtotal: '160.00',
      coupon: { name: 'SAVE20', discount: '20.00' },
      user: expect.objectContaining({ id: 'user_1' }),
      items: [
        expect.objectContaining({ price: '160.00', lineTotal: '160.00' }),
      ],
    });
  });

  it('404s admin detail for unknown orders', async () => {
    tx.order.findUnique.mockResolvedValueOnce(null);

    await expect(service.get('order_x')).rejects.toMatchObject({
      response: { code: 'RESOURCE_NOT_FOUND' },
    });
  });

  it('404s status updates for unknown orders', async () => {
    tx.order.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.updateStatus('manager_1', 'order_x', {
        status: OrderStatus.PROCESSING,
      }),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } });
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('rejects cancelling a paid order (must be refunded instead)', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.PROCESSING,
      paymentMethod: PaymentMethod.CASH,
      isPaid: true,
      couponId: null,
      items: [{ productId: 'prod_1', quantity: 1 }],
    });

    await expect(
      service.updateStatus('manager_1', 'order_1', {
        status: OrderStatus.CANCELLED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ordersService.restoreOrderInventory).not.toHaveBeenCalled();
  });

  it('moves processing orders to shipped without touching stock', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.PROCESSING,
      paymentMethod: PaymentMethod.CASH,
      isPaid: false,
      couponId: null,
      items: [{ productId: 'prod_1', quantity: 1 }],
    });

    await expect(
      service.updateStatus('manager_1', 'order_1', {
        status: OrderStatus.SHIPPED,
      }),
    ).resolves.toMatchObject({ id: 'order_1' });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('delivers shipped paid orders and stamps isDelivered/deliveredAt', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.SHIPPED,
      paymentMethod: PaymentMethod.CASH,
      isPaid: true,
      couponId: null,
      items: [{ productId: 'prod_1', quantity: 1 }],
    });

    await service.updateStatus('manager_1', 'order_1', {
      status: OrderStatus.DELIVERED,
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: {
        status: OrderStatus.DELIVERED,
        notes: undefined,
        isDelivered: true,
        deliveredAt: expect.any(Date),
      },
    });
  });

  it('rejects transitions with no defined path (e.g. pending → delivered)', async () => {
    await expect(
      service.updateStatus('manager_1', 'order_1', {
        status: OrderStatus.DELIVERED,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('404s markPaid for unknown orders', async () => {
    tx.order.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.markPaid('manager_1', 'order_x'),
    ).rejects.toMatchObject({ response: { code: 'RESOURCE_NOT_FOUND' } });
  });

  it('filters the admin list by creation date range', async () => {
    await service.list({
      page: 1,
      limit: 20,
      from: '2026-07-01',
      to: '2026-07-09',
    });

    expect(tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: {
            gte: new Date('2026-07-01'),
            lte: new Date('2026-07-09'),
          },
        },
      }),
    );
  });

  it('falls back to anonName then "Guest" for customer names in the list', async () => {
    tx.order.findMany.mockResolvedValueOnce([
      {
        id: 'order_2',
        humanOrderId: 'ORD-000043',
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        isPaid: false,
        totalOrderPrice: new Prisma.Decimal('100.00'),
        createdAt: adminOrder.createdAt,
        anonName: 'Anon Buyer',
        user: null,
        _count: { items: 1 },
      },
      {
        id: 'order_3',
        humanOrderId: 'ORD-000044',
        status: OrderStatus.PENDING,
        paymentMethod: PaymentMethod.CASH,
        isPaid: false,
        totalOrderPrice: null,
        createdAt: adminOrder.createdAt,
        anonName: null,
        user: null,
        _count: { items: 1 },
      },
    ]);

    await expect(service.list({ page: 1, limit: 20 })).resolves.toMatchObject({
      data: [
        { customerName: 'Anon Buyer' },
        { customerName: 'Guest', totalOrderPrice: '0.00' },
      ],
    });
  });

  it('rejects marking a cancelled CASH order paid', async () => {
    tx.order.findUnique.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.CANCELLED,
      paymentMethod: PaymentMethod.CASH,
      isPaid: false,
      couponId: null,
      items: [{ productId: 'prod_1', quantity: 1 }],
    });

    await expect(
      service.markPaid('manager_1', 'order_1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});
