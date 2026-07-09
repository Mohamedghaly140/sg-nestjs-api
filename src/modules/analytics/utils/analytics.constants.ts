import { OrderStatus } from '../../../generated/prisma/client';

export const EXCLUDED_REVENUE_STATUSES = [
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
] as const;
