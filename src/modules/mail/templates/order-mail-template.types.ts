import { OrderStatus, PaymentMethod } from '../../../generated/prisma/client';

export interface OrderTemplateItem {
  name: string;
  quantity: number;
  price: string;
  lineTotal: string;
}

export interface OrderTemplateData {
  humanOrderId: string;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  isPaid: boolean;
  items: OrderTemplateItem[];
  itemsSubtotal: string;
  discountApplied: string;
  shippingFees: string;
  totalOrderPrice: string;
}

export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
}
