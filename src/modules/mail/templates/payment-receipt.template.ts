import {
  type MailContentBlock,
  renderMailLayout,
} from './mail-layout.template';
import type {
  MailTemplate,
  OrderTemplateData,
} from './order-mail-template.types';

export function paymentReceiptTemplate(order: OrderTemplateData): MailTemplate {
  const blocks: MailContentBlock[] = [
    { type: 'paragraph', text: `Hello ${order.customerName},` },
    {
      type: 'paragraph',
      text: `We received payment for SG Couture order ${order.humanOrderId}.`,
    },
    { type: 'itemsTable', items: order.items },
    {
      type: 'totals',
      itemsSubtotal: order.itemsSubtotal,
      discountApplied: order.discountApplied,
      shippingFees: order.shippingFees,
      totalOrderPrice: order.totalOrderPrice,
    },
  ];
  const rendered = renderMailLayout({
    previewText: `Payment received for ${order.humanOrderId}`,
    heading: `Order ${order.humanOrderId}`,
    blocks,
  });

  return {
    subject: `Payment received for ${order.humanOrderId}`,
    html: rendered.html,
    text: rendered.text,
  };
}
