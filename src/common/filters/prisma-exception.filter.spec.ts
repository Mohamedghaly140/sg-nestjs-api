import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import type { Logger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client';
import { ERROR_CODES } from '../constants/error-codes';
import { PrismaExceptionFilter } from './prisma-exception.filter';

describe('PrismaExceptionFilter', () => {
  let logger: jest.Mocked<Pick<Logger, 'warn' | 'error'>>;
  let response: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let host: ArgumentsHost;
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    logger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    host = {
      switchToHttp: () => ({
        getResponse: () => response as unknown as Response,
        getRequest: jest.fn(),
        getNext: jest.fn(),
      }),
    } as ArgumentsHost;
    filter = new PrismaExceptionFilter(logger as unknown as Logger);
  });

  function prismaError(
    code: string,
    meta?: Record<string, unknown>,
  ): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('database error', {
      code,
      clientVersion: '7.8.0',
      meta,
    });
  }

  it('maps P2002 to a duplicate-resource conflict and includes the target', () => {
    filter.catch(prismaError('P2002', { target: ['email'] }), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Duplicate resource (email)',
      code: ERROR_CODES.DUPLICATE_RESOURCE,
    });
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps P2025 to resource not found', () => {
    filter.catch(prismaError('P2025'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Resource not found',
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('maps P2003 to a foreign-key conflict', () => {
    filter.catch(prismaError('P2003'), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Foreign key constraint violation',
      code: ERROR_CODES.FOREIGN_KEY_CONSTRAINT,
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('maps an unknown known-request-error code to a generic 500', () => {
    filter.catch(prismaError('P2999'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Internal server error',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
    expect(logger.error).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
