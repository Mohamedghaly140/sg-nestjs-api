import { Prisma } from '../../../generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AnalyticsGrouping = 'day' | 'week' | 'month';

export interface AnalyticsDateRange {
  start: Date;
  end: Date;
}

export function resolveDateRange(
  from?: string,
  to?: string,
  now = new Date(),
): AnalyticsDateRange {
  const end = endOfUtcDay(to ? parseDateOnly(to) : now);
  const defaultStart = new Date(end);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 30);

  return {
    start: startOfUtcDay(from ? parseDateOnly(from) : defaultStart),
    end,
  };
}

export function resolveGrouping(start: Date, end: Date): AnalyticsGrouping {
  const startDay = startOfUtcDay(start).getTime();
  const endDay = startOfUtcDay(end).getTime();
  const spanDays = Math.ceil((endDay - startDay) / DAY_MS);

  if (spanDays <= 60) {
    return 'day';
  }
  if (spanDays <= 180) {
    return 'week';
  }
  return 'month';
}

export function coercePlainNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    return Number(value);
  }
  if (
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }

  return Number(value);
}

export function roundMetric(value: number): number {
  return Number(value.toFixed(2));
}

export function formatBucketDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

export function dateTruncUnit(grouping: AnalyticsGrouping): Prisma.Sql {
  return Prisma.sql`${grouping}`;
}

function parseDateOnly(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00.000Z`);
  }
  return new Date(value);
}

function startOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfUtcDay(value: Date): Date {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}
