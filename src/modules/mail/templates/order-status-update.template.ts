import { OrderStatus } from '../../../generated/prisma/client';
import {
  type MailContentBlock,
  renderMailLayout,
} from './mail-layout.template';
import type {
  MailTemplate,
  OrderTemplateData,
} from './order-mail-template.types';

const STATUS_COPY: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'is pending',
  [OrderStatus.PROCESSING]: 'is being processed',
  [OrderStatus.SHIPPED]: 'has shipped',
  [OrderStatus.DELIVERED]: 'has been delivered',
  [OrderStatus.CANCELLED]: 'has been cancelled',
  [OrderStatus.REFUNDED]: 'has been refunded',
};

export function orderStatusUpdateTemplate(
  order: OrderTemplateData,
  status: OrderStatus,
): MailTemplate {
  const statusCopy = STATUS_COPY[status];
  const blocks: MailContentBlock[] = [
    { type: 'paragraph', text: `Hello ${order.customerName},` },
    {
      type: 'paragraph',
      text: `Your SG Couture order ${order.humanOrderId} ${statusCopy}.`,
    },
    { type: 'paragraph', text: `Order total: EGP ${order.totalOrderPrice}` },
  ];
  const rendered = renderMailLayout({
    previewText: `Order ${order.humanOrderId} ${statusCopy}`,
    heading: `Order ${order.humanOrderId}`,
    blocks,
  });

  return {
    subject: `Order ${order.humanOrderId} ${statusCopy}`,
    html: rendered.html,
    text: rendered.text,
  };
}
