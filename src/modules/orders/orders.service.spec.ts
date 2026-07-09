/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
} from '../../generated/prisma/client';
import type { CartService } from '../cart/cart.service';
import type { CouponsService } from '../coupons/coupons.service';
import type { ShippingService } from '../shipping/shipping.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const cart = {
    id: 'cart_1',
    userId: 'user_1',
    sessionToken: null,
    items: [
      {
        id: 'cart_item_1',
        productId: 'prod_1',
        quantity: 2,
        color: 'Black',
        size: 'M',
        price: new Prisma.Decimal('70.00'),
        product: {
          id: 'prod_1',
          name: 'Dress',
          slug: 'dress',
          imageUrl: 'https://example.test/dress.jpg',
          quantity: 5,
          status: ProductStatus.ACTIVE,
          colors: ['Black'],
          sizes: ['M'],
          priceAfterDiscount: new Prisma.Decimal('80.00'),
        },
      },
    ],
  };
  const orderDetail = {
    id: 'order_1',
    humanOrderId: 'ORD-000042',
    status: OrderStatus.PENDING,
    paymentMethod: PaymentMethod.CARD,
    shippingFees: new Prisma.Decimal('65.00'),
    totalOrderPrice: new Prisma.Decimal('225.00'),
    discountApplied: new Prisma.Decimal('0.00'),
    isPaid: false,
    createdAt: new Date('2026-07-09T12:00:00.000Z'),
    items: [
      {
        id: 'order_item_1',
        productId: 'prod_1',
        quantity: 2,
        color: 'Black',
        size: 'M',
        price: new Prisma.Decimal('80.00'),
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
    $queryRaw: jest.fn((strings: TemplateStringsArray) =>
      strings[0].includes('nextval')
        ? Promise.resolve([{ nextval: 42 }])
        : Promise.resolve([]),
    ),
    address: {
      findFirst: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn(
      <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    ),
  };
  const cartService = {
    loadCartForCheckout: jest.fn(),
    clearCartInTx: jest.fn(),
  };
  const couponsService = {
    findEligibleCoupon: jest.fn(),
    consumeCoupon: jest.fn(),
    releaseCoupon: jest.fn(),
  };
  const shippingService = {
    getFee: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const eventEmitter = {
    emit: jest.fn(),
  };
  const service = new OrdersService(
    prisma as never,
    cartService as unknown as CartService,
    couponsService as unknown as CouponsService,
    shippingService as unknown as ShippingService,
    configService as unknown as ConfigService,
    eventEmitter as unknown as EventEmitter2,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.address.findFirst.mockResolvedValue({
      id: 'addr_1',
      country: 'Egypt',
      governorate: 'Cairo',
      city: 'Nasr City',
    });
    tx.product.findUnique.mockResolvedValue({
      id: 'prod_1',
      name: 'Dress',
      imageUrl: 'https://example.test/dress.jpg',
      status: ProductStatus.ACTIVE,
      colors: ['Black'],
      sizes: ['M'],
      quantity: 5,
      priceAfterDiscount: new Prisma.Decimal('80.00'),
    });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.order.create.mockResolvedValue(orderDetail);
    tx.order.findFirst.mockResolvedValue(orderDetail);
    tx.order.findUnique.mockResolvedValue(orderDetail);
    tx.order.update.mockResolvedValue(orderDetail);
    cartService.loadCartForCheckout.mockResolvedValue(cart);
    cartService.clearCartInTx.mockResolvedValue(undefined);
    couponsService.findEligibleCoupon.mockResolvedValue({
      id: 'coupon_1',
      discount: new Prisma.Decimal('20.00'),
    });
    couponsService.consumeCoupon.mockResolvedValue(undefined);
    couponsService.releaseCoupon.mockResolvedValue(undefined);
    shippingService.getFee.mockResolvedValue({ fee: '65.00' });
    configService.get.mockReturnValue(undefined);
  });

  it('checks out a registered cart with live prices and emits after commit', async () => {
    await expect(
      service.checkout('user_1', {
        shippingAddressId: 'addr_1',
        paymentMethod: PaymentMethod.CARD,
      }),
    ).resolves.toMatchObject({
      id: 'order_1',
      humanOrderId: 'ORD-000042',
      itemsSubtotal: '160.00',
      shippingFees: '65.00',
      totalOrderPrice: '225.00',
    });

    expect(cartService.loadCartForCheckout).toHaveBeenCalledWith(tx, {
      userId: 'user_1',
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod_1', quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          humanOrderId: 'ORD-000042',
          userId: 'user_1',
          shippingAddressId: 'addr_1',
          totalOrderPrice: new Prisma.Decimal('225.00'),
        }),
      }),
    );
    expect(cartService.clearCartInTx).toHaveBeenCalledWith(tx, cart);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({ orderId: 'order_1' }),
    );
  });

  it('checks out a guest cart using only the session token and returns no real token', async () => {
    cartService.loadCartForCheckout.mockResolvedValueOnce({
      ...cart,
      userId: null,
      sessionToken: 'session_1',
    });

    await expect(
      service.checkoutGuest(
        { userId: 'user_ignored', sessionToken: 'session_1' },
        {
          paymentMethod: PaymentMethod.CASH,
          contact: {
            name: 'Guest',
            phone: '+201000000001',
            email: 'guest@example.com',
          },
          shipping: {
            country: 'Egypt',
            governorate: 'Cairo',
            city: 'Nasr City',
            area: 'District 7',
            phone: '+201000000002',
            addressLine1: '12 Street',
            details: 'Floor 3',
          },
        },
      ),
    ).resolves.toMatchObject({ claimToken: 'sent-by-email' });

    expect(cartService.loadCartForCheckout).toHaveBeenCalledWith(tx, {
      sessionToken: 'session_1',
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: undefined,
          anonEmail: 'guest@example.com',
          guestToken: expect.any(String),
        }),
      }),
    );
  });

  it('rejects an empty checkout cart', async () => {
    cartService.loadCartForCheckout.mockResolvedValueOnce({
      ...cart,
      items: [],
    });

    await expect(
      service.checkout('user_1', {
        shippingAddressId: 'addr_1',
        paymentMethod: PaymentMethod.CARD,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('rejects invalid line variants before stock reservation', async () => {
    tx.product.findUnique.mockResolvedValueOnce({
      id: 'prod_1',
      name: 'Dress',
      imageUrl: 'https://example.test/dress.jpg',
      status: ProductStatus.ACTIVE,
      colors: ['Red'],
      sizes: ['M'],
      quantity: 5,
      priceAfterDiscount: new Prisma.Decimal('80.00'),
    });

    await expect(
      service.checkout('user_1', {
        shippingAddressId: 'addr_1',
        paymentMethod: PaymentMethod.CARD,
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_VARIANT' } });
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('collects insufficient stock failures before throwing', async () => {
    tx.product.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.product.findUnique
      .mockResolvedValueOnce({
        id: 'prod_1',
        name: 'Dress',
        imageUrl: 'https://example.test/dress.jpg',
        status: ProductStatus.ACTIVE,
        colors: ['Black'],
        sizes: ['M'],
        quantity: 5,
        priceAfterDiscount: new Prisma.Decimal('80.00'),
      })
      .mockResolvedValueOnce({ quantity: 0 });

    await expect(
      service.checkout('user_1', {
        shippingAddressId: 'addr_1',
        paymentMethod: PaymentMethod.CARD,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('claims valid guest orders and nulls the token', async () => {
    tx.order.findFirst.mockResolvedValueOnce({ id: 'order_1' });
    tx.order.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.order.findUnique.mockResolvedValueOnce(orderDetail);

    await expect(
      service.claim('user_1', { token: 'a'.repeat(64) }),
    ).resolves.toMatchObject({ id: 'order_1' });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order_1',
        guestToken: 'a'.repeat(64),
        guestTokenExpiresAt: { gt: expect.any(Date) },
      },
      data: {
        userId: 'user_1',
        claimedByUserId: 'user_1',
        guestToken: null,
        guestTokenExpiresAt: null,
      },
    });
  });

  it('rejects claiming a token already consumed by a concurrent claim', async () => {
    tx.order.findFirst.mockResolvedValueOnce({ id: 'order_1' });
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.claim('user_1', { token: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ response: { code: 'CLAIM_TOKEN_INVALID' } });
    expect(tx.order.findUnique).not.toHaveBeenCalled();
  });

  it('cancels pending unpaid user orders with restoration', async () => {
    tx.order.findFirst.mockResolvedValueOnce({
      id: 'order_1',
      status: OrderStatus.PENDING,
      isPaid: false,
      couponId: 'coupon_1',
      items: [{ productId: 'prod_1', quantity: 2 }],
    });
    tx.order.findUnique.mockResolvedValueOnce({
      ...orderDetail,
      status: OrderStatus.CANCELLED,
    });

    await expect(
      service.cancelMine('user_1', 'order_1'),
    ).resolves.toMatchObject({
      status: OrderStatus.CANCELLED,
    });
    expect(couponsService.releaseCoupon).toHaveBeenCalledWith(
      tx,
      'coupon_1',
      'order_1',
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'order.status_changed',
      expect.objectContaining({ orderId: 'order_1' }),
    );
  });
});
