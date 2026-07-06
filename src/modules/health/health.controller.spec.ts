import { ServiceUnavailableException } from '@nestjs/common';
import type {
  HealthCheckResult,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import type { PrismaService } from '../../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let healthCheck: jest.Mock;
  let prismaPingCheck: jest.Mock;
  let controller: HealthController;

  beforeEach(() => {
    healthCheck = jest.fn();
    prismaPingCheck = jest.fn();
    controller = new HealthController(
      { check: healthCheck } as unknown as HealthCheckService,
      { pingCheck: prismaPingCheck } as unknown as PrismaHealthIndicator,
      {} as unknown as PrismaService,
    );
  });

  it('returns the compact health payload after a successful check', async () => {
    const result: HealthCheckResult = {
      status: 'ok',
      info: { database: { status: 'up' } },
      error: {},
      details: { database: { status: 'up' } },
    };
    healthCheck.mockImplementation(
      async (indicators: Array<() => Promise<unknown>>) => {
        await indicators[0]();
        return result;
      },
    );
    prismaPingCheck.mockResolvedValue({ database: { status: 'up' } });

    await expect(controller.check()).resolves.toEqual({
      app: 'up',
      database: 'up',
    });
    expect(prismaPingCheck).toHaveBeenCalledWith('database', {});
  });

  it('propagates a failed health check for the exception filter to format', async () => {
    const exception = new ServiceUnavailableException({
      status: 'error',
      details: { database: { status: 'down' } },
    });
    healthCheck.mockRejectedValue(exception);

    await expect(controller.check()).rejects.toBe(exception);
  });
});
