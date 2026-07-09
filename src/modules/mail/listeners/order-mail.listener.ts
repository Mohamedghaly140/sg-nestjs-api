import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from 'nestjs-pino';
import { OrderStatus, Prisma } from '../../../generated/prisma/client';
import { OrderCreatedEvent } from '../../orders/events/order-created.event';
import { OrderPaidEvent } from '../../orders/events/order-paid.event';
import { OrderStatusChangedEvent } from '../../orders/events/order-status-changed.event';
import { OrdersService, type OrderForMail } from '../../orders/orders.service';
import { MailService } from '../mail.service';
import { orderConfirmationTemplate } from '../templates/order-confirmation.template';
import { paymentReceiptTemplate } from '../templates/payment-receipt.template';
import { orderStatusUpdateTemplate } from '../templates/order-status-update.template';
import type { OrderTemplateData } from '../templates/order-mail-template.types';

const EMAIL_STATUSES = new Set<OrderStatus>([
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

@Injectable()
export class OrderMailListener {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  @OnEvent('order.created')
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      const order = await this.ordersService.getOrderForMail(event.orderId);
      const templateOrder = this.toTemplateOrder(order);

      if (order.user?.email) {
        await this.mailService.sendEmail({
          to: order.user.email,
          ...orderConfirmationTemplate({ order: templateOrder }),
          context: this.context('order.created', order),
        });
        return;
      }

      if (!order.anonEmail || !order.guestToken) {
        this.warnSkipped('order.created', order, 'missing guest recipient');
        return;
      }

      const storefrontUrl = this.config.get<string>('mail.storefrontUrl');
      if (!storefrontUrl) {
        this.warnSkipped('order.created', order, 'missing storefront url');
        return;
      }

      await this.mailService.sendEmail({
        to: order.anonEmail,
        ...orderConfirmationTemplate({
          order: templateOrder,
          claimLink: this.buildClaimLink(storefrontUrl, order.guestToken),
          guestTokenTtlDays:
            this.config.get<number>('cart.guestTokenTtlDays') ?? 30,
        }),
        context: this.context('order.created', order),
      });
    } catch (error: unknown) {
      this.logListenerFailure('order.created', event.orderId, error);
    }
  }

  @OnEvent('order.paid')
  async handleOrderPaid(event: OrderPaidEvent): Promise<void> {
    try {
      const order = await this.ordersService.getOrderForMail(event.orderId);
      const recipient = this.recipientEmail(order);
      if (!recipient) {
        this.warnSkipped('order.paid', order, 'missing recipient');
        return;
      }

      await this.mailService.sendEmail({
        to: recipient,
        ...paymentReceiptTemplate(this.toTemplateOrder(order)),
        context: this.context('order.paid', order),
      });
    } catch (error: unknown) {
      this.logListenerFailure('order.paid', event.orderId, error);
    }
  }

  @OnEvent('order.status_changed')
  async handleOrderStatusChanged(
    event: OrderStatusChangedEvent,
  ): Promise<void> {
    if (!EMAIL_STATUSES.has(event.status)) {
      return;
    }

    try {
      const order = await this.ordersService.getOrderForMail(event.orderId);
      const recipient = this.recipientEmail(order);
      if (!recipient) {
        this.warnSkipped('order.status_changed', order, 'missing recipient');
        return;
      }

      await this.mailService.sendEmail({
        to: recipient,
        ...orderStatusUpdateTemplate(this.toTemplateOrder(order), event.status),
        context: this.context('order.status_changed', order),
      });
    } catch (error: unknown) {
      this.logListenerFailure('order.status_changed', event.orderId, error);
    }
  }

  private recipientEmail(order: OrderForMail): string | null {
    return order.user?.email ?? order.anonEmail;
  }

  private toTemplateOrder(order: OrderForMail): OrderTemplateData {
    const items = order.items.map((item) => {
      const price = new Prisma.Decimal(item.price ?? 0);
      return {
        name: item.product.name,
        quantity: item.quantity,
        price: price.toFixed(2),
        lineTotal: price.mul(item.quantity).toFixed(2),
      };
    });
    const itemsSubtotal = items.reduce(
      (sum, item) => sum.add(item.lineTotal),
      new Prisma.Decimal(0),
    );

    return {
      humanOrderId: order.humanOrderId,
      customerName: order.user?.name ?? order.anonName ?? 'Customer',
      status: order.status,
      paymentMethod: order.paymentMethod,
      isPaid: order.isPaid,
      items,
      itemsSubtotal: itemsSubtotal.toFixed(2),
      discountApplied: new Prisma.Decimal(order.discountApplied ?? 0).toFixed(
        2,
      ),
      shippingFees: new Prisma.Decimal(order.shippingFees).toFixed(2),
      totalOrderPrice: new Prisma.Decimal(order.totalOrderPrice ?? 0).toFixed(
        2,
      ),
    };
  }

  private buildClaimLink(storefrontUrl: string, token: string): string {
    const url = new URL('/orders/claim', storefrontUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private context(event: string, order: OrderForMail) {
    return {
      event,
      orderId: order.id,
      humanOrderId: order.humanOrderId,
    };
  }

  private warnSkipped(
    event: string,
    order: OrderForMail,
    reason: string,
  ): void {
    this.logger.warn(
      {
        event,
        orderId: order.id,
        humanOrderId: order.humanOrderId,
        reason,
      },
      'Skipping transactional email',
    );
  }

  private logListenerFailure(
    event: string,
    orderId: string,
    error: unknown,
  ): void {
    this.logger.error(
      { audit: true, err: error, event, orderId },
      'Order mail listener failed',
    );
  }
}
