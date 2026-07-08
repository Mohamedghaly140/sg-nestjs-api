import { IsFutureDateConstraint } from './is-future-date.validator';

describe('IsFutureDateConstraint', () => {
  const validator = new IsFutureDateConstraint();

  it('accepts future dates', () => {
    expect(validator.validate(new Date(Date.now() + 60_000))).toBe(true);
  });

  it('rejects past dates', () => {
    expect(validator.validate(new Date(Date.now() - 60_000))).toBe(false);
  });

  it('rejects invalid input', () => {
    expect(validator.validate('2026-01-01')).toBe(false);
    expect(validator.validate(new Date('not-a-date'))).toBe(false);
  });
});
