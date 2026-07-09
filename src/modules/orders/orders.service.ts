import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'node:crypto';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  ProductStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService, type CartForCheckout } from '../cart/cart.service';
import type { CartServiceIdentity } from '../cart/interfaces/cart-service-identity.interface';
import { CouponsService } from '../coupons/coupons.service';
import { ShippingService } from '../shipping/shipping.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ClaimOrderDto } from './dto/claim-order.dto';
import { GuestCheckoutDto } from './dto/guest-checkout.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderSummaryDto } from './dto/order-summary.dto';
import { QueryMyOrdersDto } from './dto/query-my-orders.dto';
import { OrderCreatedEvent } from './events/order-created.event';
import { OrderStatusChangedEvent } from './events/order-status-changed.event';

// Prisma's default interactive-transaction timeout (5000ms) is too short for
// the checkout transaction under lock contention: a burst of concurrent
// checkouts for the same product serializes on lockAndValidateLines' row
// lock, so requests queued behind it can wait past 5s and get a raw 500
// instead of a clean 409 INSUFFICIENT_STOCK. Found via the Phase 11 load
// test (test/load/checkout-load.ts, ~10-way contention timed out at ~5s);
// raised with margin, not unbounded — see docs/testing/phase-11-load-test.md.
const CHECKOUT_TRANSACTION_OPTIONS = { timeout: 15_000 };

const ORDER_DETAIL_SELECT = {
  id: true,
  humanOrderId: true,
  status: true,
  paymentMethod: true,
  shippingFees: true,
  totalOrderPrice: true,
  discountApplied: true,
  isPaid: true,
  createdAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      color: true,
      size: true,
      price: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderSelect;

const ORDER_FOR_RESTORE_SELECT = {
  id: true,
  status: true,
  couponId: true,
  isPaid: true,
  items: {
    select: {
      productId: true,
      quantity: true,
    },
  },
} satisfies Prisma.OrderSelect;

const ORDER_FOR_MAIL_SELECT = {
  id: true,
  humanOrderId: true,
  status: true,
  paymentMethod: true,
  isPaid: true,
  totalOrderPrice: true,
  shippingFees: true,
  discountApplied: true,
  guestToken: true,
  anonName: true,
  anonEmail: true,
  user: {
    select: {
      email: true,
      name: true,
    },
  },
  items: {
    select: {
      quantity: true,
      price: true,
      product: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderSelect;

type OrderDetail = Prisma.OrderGetPayload<{
  select: typeof ORDER_DETAIL_SELECT;
}>;
export type OrderForRestore = Prisma.OrderGetPayload<{
  select: typeof ORDER_FOR_RESTORE_SELECT;
}>;
export type OrderForMail = Prisma.OrderGetPayload<{
  select: typeof ORDER_FOR_MAIL_SELECT;
}>;

interface CheckoutLine {
  productId: string;
  productName: string;
  imageUrl: string | null;
  quantity: number;
  color: string | null;
  size: string | null;
  price: Prisma.Decimal;
}

interface RunCheckoutParams {
  cart: CartForCheckout;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  notes?: string;
  userId?: string;
  shippingAddressId?: string;
  anonContact?: GuestCheckoutDto['contact'];
  anonShipping?: GuestCheckoutDto['shipping'];
  shippingDestination: {
    country: string;
    governorate: string;
    city?: string;
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly couponsService: CouponsService,
    private readonly shippingService: ShippingService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkout(userId: string, dto: CheckoutDto): Promise<OrderResponseDto> {
    this.assertPaymentMethodAvailable(dto.paymentMethod);
    const order = await this.prisma.$transaction(async (tx) => {
      const address = await tx.address.findFirst({
        where: { id: dto.shippingAddressId, userId },
        select: {
          id: true,
          country: true,
          governorate: true,
          city: true,
        },
      });
      if (!address) {
        throw this.notFound('Address not found');
      }

      const cart = await this.cartService.loadCartForCheckout(tx, { userId });
      return this.runCheckout(tx, {
        cart: this.assertCartNotEmpty(cart),
        paymentMethod: dto.paymentMethod,
        couponCode: dto.couponCode,
        notes: dto.notes,
        userId,
        shippingAddressId: address.id,
        shippingDestination: {
          country: address.country,
          governorate: address.governorate,
          city: address.city,
        },
      });
    }, CHECKOUT_TRANSACTION_OPTIONS);

    this.eventEmitter.emit('order.created', new OrderCreatedEvent(order.id));
    return this.toOrderResponse(order);
  }

  async checkoutGuest(
    identity: CartServiceIdentity,
    dto: GuestCheckoutDto,
  ): Promise<OrderResponseDto & { claimToken: 'sent-by-email' }> {
    this.assertPaymentMethodAvailable(dto.paymentMethod);
    const order = await this.prisma.$transaction(async (tx) => {
      const cart = identity.sessionToken
        ? await this.cartService.loadCartForCheckout(tx, {
            sessionToken: identity.sessionToken,
          })
        : null;

      return this.runCheckout(tx, {
        cart: this.assertCartNotEmpty(cart),
        paymentMethod: dto.paymentMethod,
        couponCode: dto.couponCode,
        notes: dto.notes,
        anonContact: dto.contact,
        anonShipping: dto.shipping,
        shippingDestination: {
          country: dto.shipping.country,
          governorate: dto.shipping.governorate,
          city: dto.shipping.city,
        },
      });
    }, CHECKOUT_TRANSACTION_OPTIONS);

    this.eventEmitter.emit('order.created', new OrderCreatedEvent(order.id));
    return { ...this.toOrderResponse(order), claimToken: 'sent-by-email' };
  }

  async listMine(userId: string, query: QueryMyOrdersDto) {
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [orders, totalItems] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          humanOrderId: true,
          status: true,
          paymentMethod: true,
          isPaid: true,
          totalOrderPrice: true,
          shippingFees: true,
          discountApplied: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((order): OrderSummaryDto => this.toOrderSummary(order)),
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async getMine(userId: string, id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      select: ORDER_DETAIL_SELECT,
    });
    if (!order) {
      throw this.notFound('Order not found');
    }
    return this.toOrderResponse(order);
  }

  async getGuest(token: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: {
        guestToken: token,
        guestTokenExpiresAt: { gt: new Date() },
      },
      select: ORDER_DETAIL_SELECT,
    });
    if (!order) {
      throw this.invalidClaimToken();
    }
    return this.toOrderResponse(order);
  }

  async claim(userId: string, dto: ClaimOrderDto): Promise<OrderResponseDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: {
          guestToken: dto.token,
          guestTokenExpiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!existing) {
        throw this.invalidClaimToken();
      }

      // Conditional on the token itself (not just id) so a second concurrent
      // claim of the same token — which raced past the findFirst above before
      // the first committed — sees 0 rows once the winner has nulled
      // guestToken, instead of silently reassigning an already-claimed order.
      const claimed = await tx.order.updateMany({
        where: {
          id: existing.id,
          guestToken: dto.token,
          guestTokenExpiresAt: { gt: new Date() },
        },
        data: {
          userId,
          claimedByUserId: userId,
          guestToken: null,
          guestTokenExpiresAt: null,
        },
      });
      if (claimed.count === 0) {
        throw this.invalidClaimToken();
      }
      return this.findOrderDetailOrThrow(tx, existing.id);
    });

    return this.toOrderResponse(order);
  }

  async cancelMine(userId: string, id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, id);
      const existing = await tx.order.findFirst({
        where: { id, userId },
        select: ORDER_FOR_RESTORE_SELECT,
      });
      if (!existing) {
        throw this.notFound('Order not found');
      }
      if (existing.status !== OrderStatus.PENDING || existing.isPaid) {
        throw this.invalidStatusTransition(
          'Only pending unpaid orders can be cancelled',
        );
      }

      await this.restoreOrderInventory(tx, existing);
      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
      });
      return this.findOrderDetailOrThrow(tx, id);
    });

    this.eventEmitter.emit(
      'order.status_changed',
      new OrderStatusChangedEvent(order.id, OrderStatus.CANCELLED),
    );
    return this.toOrderResponse(order);
  }

  async getOrderForMail(orderId: string): Promise<OrderForMail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ORDER_FOR_MAIL_SELECT,
    });
    if (!order) {
      throw this.notFound('Order not found');
    }
    return order;
  }

  async restoreOrderInventory(
    tx: Prisma.TransactionClient,
    order: OrderForRestore,
  ): Promise<void> {
    for (const item of order.items) {
      await tx.product.updateMany({
        where: { id: item.productId },
        data: { quantity: { increment: item.quantity } },
      });
    }

    if (order.couponId && !order.isPaid) {
      await this.couponsService.releaseCoupon(tx, order.couponId, order.id);
    }
  }

  async findOrderForRestore(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<OrderForRestore> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: ORDER_FOR_RESTORE_SELECT,
    });
    if (!order) {
      throw this.notFound('Order not found');
    }
    return order;
  }

  private async runCheckout(
    tx: Prisma.TransactionClient,
    params: RunCheckoutParams,
  ): Promise<OrderDetail> {
    const sortedItems = [...params.cart.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    const lines = await this.lockAndValidateLines(tx, sortedItems);
    const itemsSubtotal = lines.reduce(
      (sum, line) => sum.add(line.price.mul(line.quantity)),
      new Prisma.Decimal(0),
    );

    const shipping = await this.shippingService.getFee(
      params.shippingDestination,
    );
    const shippingFees = new Prisma.Decimal(shipping.fee);
    const coupon = params.couponCode
      ? await this.couponsService.findEligibleCoupon(tx, params.couponCode, {
          userId: params.userId,
          anonEmail: params.anonContact?.email,
        })
      : null;
    const discountApplied = coupon
      ? this.computeDiscount(itemsSubtotal, coupon.discount)
      : new Prisma.Decimal(0);
    const totalOrderPrice = itemsSubtotal
      .sub(discountApplied)
      .add(shippingFees);

    await this.reserveStock(tx, lines);
    const humanOrderId = await this.nextHumanOrderId(tx);
    const guestToken = params.anonContact
      ? randomBytes(32).toString('hex')
      : undefined;
    const order = await tx.order.create({
      data: {
        humanOrderId,
        status: OrderStatus.PENDING,
        paymentMethod: params.paymentMethod,
        shippingFees,
        totalOrderPrice,
        discountApplied,
        notes: params.notes,
        userId: params.userId,
        shippingAddressId: params.shippingAddressId,
        couponId: coupon?.id,
        anonName: params.anonContact?.name,
        anonPhone: params.anonContact?.phone,
        anonEmail: params.anonContact?.email,
        anonCountry: params.anonShipping?.country,
        anonGovernorate: params.anonShipping?.governorate,
        anonCity: params.anonShipping?.city,
        anonArea: params.anonShipping?.area,
        anonShippingPhone: params.anonShipping?.phone,
        anonAddressLine1: params.anonShipping?.addressLine1,
        anonDetails: params.anonShipping?.details,
        anonPostalCode: params.anonShipping?.postalCode,
        anonLatitude: params.anonShipping?.latitude,
        anonLongitude: params.anonShipping?.longitude,
        guestToken,
        guestTokenExpiresAt: guestToken
          ? this.nextGuestTokenExpiry()
          : undefined,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            color: line.color,
            size: line.size,
            price: line.price,
          })),
        },
      },
      select: ORDER_DETAIL_SELECT,
    });

    if (coupon) {
      await this.couponsService.consumeCoupon(tx, {
        couponId: coupon.id,
        orderId: order.id,
        userId: params.userId,
        anonEmail: params.anonContact?.email,
      });
    }

    await this.cartService.clearCartInTx(tx, params.cart);
    return order;
  }

  private async lockAndValidateLines(
    tx: Prisma.TransactionClient,
    items: CartForCheckout['items'],
  ): Promise<CheckoutLine[]> {
    const errors: Array<Record<string, unknown>> = [];
    const lines: CheckoutLine[] = [];

    for (const item of items) {
      await tx.$queryRaw`SELECT id FROM "products" WHERE id = ${item.productId} FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          status: true,
          colors: true,
          sizes: true,
          quantity: true,
          priceAfterDiscount: true,
        },
      });

      const valid =
        product &&
        product.status === ProductStatus.ACTIVE &&
        (item.color === null || product.colors.includes(item.color)) &&
        (item.size === null || product.sizes.includes(item.size));
      if (!valid || !product) {
        errors.push({
          productId: item.productId,
          color: item.color,
          size: item.size,
          code: ERROR_CODES.INVALID_VARIANT,
        });
        continue;
      }

      lines.push({
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        price: product.priceAfterDiscount,
      });
    }

    if (errors.length > 0) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.INVALID_VARIANT,
        message: 'One or more cart lines are no longer available',
        errors,
      });
    }

    return lines;
  }

  private async reserveStock(
    tx: Prisma.TransactionClient,
    lines: CheckoutLine[],
  ): Promise<void> {
    const errors: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      const result = await tx.product.updateMany({
        where: { id: line.productId, quantity: { gte: line.quantity } },
        data: { quantity: { decrement: line.quantity } },
      });
      if (result.count === 0) {
        const current = await tx.product.findUnique({
          where: { id: line.productId },
          select: { quantity: true },
        });
        errors.push({
          productId: line.productId,
          requested: line.quantity,
          available: current?.quantity ?? 0,
        });
      }
    }

    if (errors.length > 0) {
      throw new ConflictException({
        code: ERROR_CODES.INSUFFICIENT_STOCK,
        message: 'Insufficient stock for one or more items',
        errors,
      });
    }
  }

  private assertCartNotEmpty(cart: CartForCheckout | null): CartForCheckout {
    if (cart && cart.items.length > 0) {
      return cart;
    }
    throw new UnprocessableEntityException({
      code: ERROR_CODES.CART_EMPTY,
      message: 'Cart is empty',
    });
  }

  private async nextHumanOrderId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const rows = await tx.$queryRaw<
      Array<{ nextval: bigint | number | string }>
    >`
      SELECT nextval('order_number_seq')
    `;
    const next = rows[0]?.nextval;
    return `ORD-${String(next).padStart(6, '0')}`;
  }

  private async lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${orderId} FOR UPDATE`;
  }

  private async findOrderDetailOrThrow(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<OrderDetail> {
    const order = await tx.order.findUnique({
      where: { id },
      select: ORDER_DETAIL_SELECT,
    });
    if (!order) {
      throw this.notFound('Order not found');
    }
    return order;
  }

  private computeDiscount(
    itemsSubtotal: Prisma.Decimal,
    discountPercent: Prisma.Decimal,
  ): Prisma.Decimal {
    return itemsSubtotal
      .mul(discountPercent)
      .div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  private nextGuestTokenExpiry(): Date {
    const ttlDays =
      this.configService.get<number>('orders.guestTokenTtlDays') ?? 30;
    return new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  }

  private toOrderSummary(order: {
    id: string;
    humanOrderId: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    isPaid: boolean;
    totalOrderPrice: Prisma.Decimal | null;
    shippingFees: Prisma.Decimal;
    discountApplied: Prisma.Decimal | null;
    createdAt: Date;
    _count: { items: number };
  }): OrderSummaryDto {
    return {
      id: order.id,
      humanOrderId: order.humanOrderId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      isPaid: order.isPaid,
      totalOrderPrice: this.formatMoney(order.totalOrderPrice),
      shippingFees: this.formatMoney(order.shippingFees),
      discountApplied: this.formatMoney(order.discountApplied),
      createdAt: order.createdAt,
      itemsCount: order._count.items,
    };
  }

  protected toOrderResponse(order: OrderDetail): OrderResponseDto {
    const items = order.items.map((item) => {
      const price = new Prisma.Decimal(item.price ?? 0);
      return {
        productId: item.productId,
        name: item.product.name,
        imageUrl: item.product.imageUrl,
        quantity: item.quantity,
        color: item.color,
        size: item.size,
        price: this.formatMoney(price),
        lineTotal: this.formatMoney(price.mul(item.quantity)),
      };
    });
    const itemsSubtotal = items.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );

    return {
      id: order.id,
      humanOrderId: order.humanOrderId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      items,
      itemsSubtotal: this.formatMoney(itemsSubtotal),
      discountApplied: this.formatMoney(order.discountApplied),
      shippingFees: this.formatMoney(order.shippingFees),
      totalOrderPrice: this.formatMoney(order.totalOrderPrice),
      isPaid: order.isPaid,
      createdAt: order.createdAt,
    };
  }

  protected formatMoney(
    value: Prisma.Decimal | string | number | null,
  ): string {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
  }

  protected notFound(message: string): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message,
    });
  }

  protected invalidStatusTransition(message: string): ConflictException {
    return new ConflictException({
      code: ERROR_CODES.INVALID_STATUS_TRANSITION,
      message,
    });
  }

  private invalidClaimToken(): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.CLAIM_TOKEN_INVALID,
      message: 'Claim token is invalid or expired',
    });
  }

  private assertPaymentMethodAvailable(paymentMethod: PaymentMethod): void {
    if (paymentMethod === PaymentMethod.CARD) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.PAYMENT_METHOD_UNAVAILABLE,
        message:
          'Card payments are not available yet; please select Cash on Delivery',
      });
    }
  }
}
