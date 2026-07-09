import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Logger } from 'nestjs-pino';
import { ERROR_CODES } from '../../common/constants/error-codes';
import { buildPaginationMeta } from '../../common/utils/build-pagination-meta';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminOrderDetailResponseDto } from './dto/admin-order-detail-response.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderPaidEvent } from './events/order-paid.event';
import { OrderStatusChangedEvent } from './events/order-status-changed.event';
import { OrdersService } from './orders.service';

const ADMIN_ORDER_DETAIL_SELECT = {
  id: true,
  humanOrderId: true,
  status: true,
  paymentMethod: true,
  shippingFees: true,
  totalOrderPrice: true,
  discountApplied: true,
  isPaid: true,
  createdAt: true,
  anonName: true,
  anonPhone: true,
  anonEmail: true,
  anonCountry: true,
  anonGovernorate: true,
  anonCity: true,
  anonArea: true,
  anonShippingPhone: true,
  anonAddressLine1: true,
  anonDetails: true,
  anonPostalCode: true,
  anonLatitude: true,
  anonLongitude: true,
  geideaSessionId: true,
  geideaOrderId: true,
  user: {
    select: { id: true, name: true, email: true, phone: true },
  },
  shippingAddress: {
    select: {
      id: true,
      alias: true,
      country: true,
      governorate: true,
      city: true,
      area: true,
      phone: true,
      addressLine1: true,
      details: true,
      postalCode: true,
      latitude: true,
      longitude: true,
      isDefault: true,
      createdAt: true,
    },
  },
  coupon: {
    select: { name: true, discount: true },
  },
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      color: true,
      size: true,
      price: true,
      product: {
        select: { id: true, name: true, slug: true, imageUrl: true },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderSelect;

type AdminOrderDetail = Prisma.OrderGetPayload<{
  select: typeof ADMIN_ORDER_DETAIL_SELECT;
}>;

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly logger: Logger,
  ) {}

  async list(query: QueryAdminOrdersDto) {
    const where = this.buildWhere(query);
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
          createdAt: true,
          anonName: true,
          user: { select: { name: true } },
          _count: { select: { items: true } },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders.map((order) => ({
        id: order.id,
        humanOrderId: order.humanOrderId,
        status: order.status,
        paymentMethod: order.paymentMethod,
        isPaid: order.isPaid,
        totalOrderPrice: this.formatMoney(order.totalOrderPrice),
        createdAt: order.createdAt,
        customerName: order.user?.name ?? order.anonName ?? 'Guest',
        itemsCount: order._count.items,
      })),
      meta: buildPaginationMeta(query.page, query.limit, totalItems),
    };
  }

  async get(id: string): Promise<AdminOrderDetailResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: ADMIN_ORDER_DETAIL_SELECT,
    });
    if (!order) {
      throw this.notFound('Order not found');
    }
    return this.toAdminOrderDetail(order);
  }

  async updateStatus(
    actingId: string,
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, id);
      const existing = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          isPaid: true,
          couponId: true,
          items: { select: { productId: true, quantity: true } },
        },
      });
      if (!existing) {
        throw this.notFound('Order not found');
      }

      await this.applyTransition(tx, existing, dto.status);
      await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          notes: dto.notes,
          ...(dto.status === OrderStatus.DELIVERED
            ? { isDelivered: true, deliveredAt: new Date() }
            : {}),
        },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        select: ADMIN_ORDER_DETAIL_SELECT,
      });
    });

    this.logger.log(
      {
        audit: true,
        action: 'order-status-update',
        actorId: actingId,
        orderId: id,
        status: dto.status,
      },
      'Order status updated',
    );
    this.eventEmitter.emit(
      'order.status_changed',
      new OrderStatusChangedEvent(order.id),
    );
    return this.toOrderResponse(order);
  }

  async markPaid(actingId: string, id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockOrder(tx, id);
      const existing = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          paymentMethod: true,
          isPaid: true,
          items: { select: { productId: true, quantity: true } },
        },
      });
      if (!existing) {
        throw this.notFound('Order not found');
      }
      if (
        existing.paymentMethod !== PaymentMethod.CASH ||
        existing.isPaid ||
        existing.status === OrderStatus.CANCELLED ||
        existing.status === OrderStatus.REFUNDED
      ) {
        throw this.invalidStatusTransition(
          'Only unpaid, non-terminal CASH orders can be marked paid',
        );
      }

      for (const item of existing.items) {
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { sold: { increment: item.quantity } },
        });
      }
      await tx.order.update({
        where: { id },
        data: { isPaid: true, paidAt: new Date() },
      });
      return tx.order.findUniqueOrThrow({
        where: { id },
        select: ADMIN_ORDER_DETAIL_SELECT,
      });
    });

    this.logger.log(
      {
        audit: true,
        action: 'order-mark-paid',
        actorId: actingId,
        orderId: id,
      },
      'Order marked paid',
    );
    this.eventEmitter.emit('order.paid', new OrderPaidEvent(order.id));
    return this.toOrderResponse(order);
  }

  private async applyTransition(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      status: OrderStatus;
      paymentMethod: PaymentMethod;
      isPaid: boolean;
      couponId: string | null;
      items: Array<{ productId: string; quantity: number }>;
    },
    next: OrderStatus,
  ): Promise<void> {
    if (order.status === next) {
      throw this.invalidStatusTransition(
        'Order is already in the requested status',
      );
    }

    if (
      order.status === OrderStatus.PENDING &&
      next === OrderStatus.PROCESSING
    ) {
      return;
    }

    if (
      (order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.PROCESSING) &&
      next === OrderStatus.CANCELLED
    ) {
      if (order.isPaid) {
        throw this.invalidStatusTransition(
          'Paid orders must be refunded, not cancelled',
        );
      }
      await this.ordersService.restoreOrderInventory(tx, order);
      return;
    }

    if (
      order.status === OrderStatus.PROCESSING &&
      next === OrderStatus.SHIPPED
    ) {
      return;
    }

    if (
      order.status === OrderStatus.SHIPPED &&
      next === OrderStatus.DELIVERED
    ) {
      if (order.paymentMethod === PaymentMethod.CASH && !order.isPaid) {
        throw this.invalidStatusTransition(
          'CASH orders must be paid before delivery',
        );
      }
      return;
    }

    if (
      order.status === OrderStatus.DELIVERED &&
      next === OrderStatus.REFUNDED
    ) {
      for (const item of order.items) {
        await tx.product.updateMany({
          where: { id: item.productId },
          data: {
            quantity: { increment: item.quantity },
            sold: { decrement: item.quantity },
          },
        });
      }
      return;
    }

    throw this.invalidStatusTransition('Invalid order status transition');
  }

  private buildWhere(query: QueryAdminOrdersDto): Prisma.OrderWhereInput {
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.isPaid === undefined ? {} : { isPaid: query.isPaid }),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { humanOrderId: { contains: query.search, mode: 'insensitive' } },
              { anonName: { contains: query.search, mode: 'insensitive' } },
              { anonEmail: { contains: query.search, mode: 'insensitive' } },
              { anonPhone: { contains: query.search, mode: 'insensitive' } },
              {
                user: { name: { contains: query.search, mode: 'insensitive' } },
              },
              {
                user: {
                  email: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                user: {
                  phone: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "orders" WHERE id = ${orderId} FOR UPDATE`;
  }

  private toAdminOrderDetail(
    order: AdminOrderDetail,
  ): AdminOrderDetailResponseDto {
    return {
      ...this.toOrderResponse(order),
      user: order.user,
      shippingAddress: order.shippingAddress,
      anonName: order.anonName,
      anonPhone: order.anonPhone,
      anonEmail: order.anonEmail,
      anonCountry: order.anonCountry,
      anonGovernorate: order.anonGovernorate,
      anonCity: order.anonCity,
      anonArea: order.anonArea,
      anonShippingPhone: order.anonShippingPhone,
      anonAddressLine1: order.anonAddressLine1,
      anonDetails: order.anonDetails,
      anonPostalCode: order.anonPostalCode,
      anonLatitude: order.anonLatitude,
      anonLongitude: order.anonLongitude,
      coupon: order.coupon
        ? {
            name: order.coupon.name,
            discount: this.formatMoney(order.coupon.discount),
          }
        : null,
      geideaSessionId: order.geideaSessionId,
      geideaOrderId: order.geideaOrderId,
      items: order.items.map((item) => {
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
          product: item.product,
        };
      }),
    };
  }

  private toOrderResponse(order: AdminOrderDetail): OrderResponseDto {
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

  private formatMoney(value: Prisma.Decimal | string | number | null): string {
    return new Prisma.Decimal(value ?? 0).toFixed(2);
  }

  private notFound(message: string): NotFoundException {
    return new NotFoundException({
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message,
    });
  }

  private invalidStatusTransition(message: string): ConflictException {
    return new ConflictException({
      code: ERROR_CODES.INVALID_STATUS_TRANSITION,
      message,
    });
  }
}
