import { computePriceAfterDiscount } from './product-pricing';

describe('computePriceAfterDiscount', () => {
  it('rounds discounted prices to two decimal places', () => {
    expect(computePriceAfterDiscount(19.99, 35).toString()).toBe('12.99');
  });

  it('keeps the full price when discount is zero', () => {
    expect(computePriceAfterDiscount('1350.00', 0).toString()).toBe('1350');
  });
});
