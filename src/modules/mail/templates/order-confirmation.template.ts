import {
  type MailContentBlock,
  renderMailLayout,
} from './mail-layout.template';
import type {
  MailTemplate,
  OrderTemplateData,
} from './order-mail-template.types';

export interface OrderConfirmationTemplateInput {
  order: OrderTemplateData;
  claimLink?: string;
  guestTokenTtlDays?: number;
}

export function orderConfirmationTemplate(
  input: OrderConfirmationTemplateInput,
): MailTemplate {
  const { order, claimLink, guestTokenTtlDays } = input;
  const subject = `Order ${order.humanOrderId} confirmation`;
  const ttlDays = guestTokenTtlDays ?? 30;
  const claimBlocks: MailContentBlock[] = claimLink
    ? [
        {
          type: 'button',
          label: `Claim your guest order within ${ttlDays} days`,
          url: claimLink,
        },
        {
          type: 'paragraph',
          text: `Guest order claim links expire after ${ttlDays} days.`,
        },
      ]
    : [];
  const blocks: MailContentBlock[] = [
    { type: 'paragraph', text: `Hello ${order.customerName},` },
    {
      type: 'paragraph',
      text: `We received your SG Couture order ${order.humanOrderId}.`,
    },
    { type: 'itemsTable', items: order.items },
    {
      type: 'totals',
      itemsSubtotal: order.itemsSubtotal,
      discountApplied: order.discountApplied,
      shippingFees: order.shippingFees,
      totalOrderPrice: order.totalOrderPrice,
    },
    ...claimBlocks,
  ];
  const rendered = renderMailLayout({
    previewText: `Order ${order.humanOrderId} confirmation`,
    heading: `Order ${order.humanOrderId}`,
    blocks,
  });

  return {
    subject,
    html: rendered.html,
    text: rendered.text,
  };
}
