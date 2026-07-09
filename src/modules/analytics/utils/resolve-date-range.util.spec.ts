import { Prisma } from '../../../generated/prisma/client';
import {
  coercePlainNumber,
  resolveDateRange,
  resolveGrouping,
} from './resolve-date-range.util';

describe('analytics date range utilities', () => {
  it.each([
    [59, 'day'],
    [60, 'day'],
    [61, 'week'],
    [179, 'week'],
    [180, 'week'],
    [181, 'month'],
  ] as const)('uses %s-day spans as %s grouping', (spanDays, grouping) => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + spanDays);

    expect(resolveGrouping(start, end)).toBe(grouping);
  });

  it('resolves explicit date-only query strings to inclusive UTC day boundaries', () => {
    expect(resolveDateRange('2026-07-01', '2026-07-09')).toEqual({
      start: new Date('2026-07-01T00:00:00.000Z'),
      end: new Date('2026-07-09T23:59:59.999Z'),
    });
  });

  it('defaults from to the start of the day 30 days before the resolved end', () => {
    expect(
      resolveDateRange(undefined, undefined, new Date('2026-07-09T10:15:00Z')),
    ).toEqual({
      start: new Date('2026-06-09T00:00:00.000Z'),
      end: new Date('2026-07-09T23:59:59.999Z'),
    });
  });

  it('coerces raw-query numeric values to JSON-safe numbers', () => {
    const values = [
      coercePlainNumber(7n),
      coercePlainNumber(new Prisma.Decimal('12.34')),
      coercePlainNumber('56.78'),
      coercePlainNumber(null),
    ];

    expect(values).toEqual([7, 12.34, 56.78, 0]);
    for (const value of values) {
      expect(typeof value).toBe('number');
      expect(() => JSON.stringify({ value })).not.toThrow();
    }
  });
});
