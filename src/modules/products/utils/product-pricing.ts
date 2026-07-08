import { Prisma } from '../../../generated/prisma/client';

type DecimalInput = string | number | Prisma.Decimal;

export function computePriceAfterDiscount(
  price: DecimalInput,
  discount: DecimalInput,
): Prisma.Decimal {
  return new Prisma.Decimal(price)
    .mul(new Prisma.Decimal(100).minus(discount))
    .div(100)
    .toDecimalPlaces(2);
}
