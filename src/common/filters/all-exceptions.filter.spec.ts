import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { Logger } from 'nestjs-pino';
import { ERROR_CODES } from '../constants/error-codes';
import {
  AllExceptionsFilter,
  resolveHttpErrorPayload,
} from './all-exceptions.filter';

describe('resolveHttpErrorPayload', () => {
  it('passes through the application error shape', () => {
    const exception = new UnprocessableEntityException({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      errors: [{ field: 'name', constraints: { isString: 'invalid' } }],
    });

    expect(resolveHttpErrorPayload(exception)).toEqual({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      errors: [{ field: 'name', constraints: { isString: 'invalid' } }],
    });
  });

  it('handles a plain string response', () => {
    const exception = new HttpException('Malformed request', 400);

    expect(resolveHttpErrorPayload(exception)).toEqual({
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Malformed request',
    });
  });

  it("handles Nest's default response object", () => {
    expect(resolveHttpErrorPayload(new ForbiddenException())).toEqual({
      code: ERROR_CODES.FORBIDDEN,
      message: 'Forbidden',
    });
  });

  it('normalizes the raw Terminus response shape', () => {
    const exception = new ServiceUnavailableException({
      status: 'error',
      info: {},
      error: { database: { status: 'down' } },
      details: { database: { status: 'down' } },
    });

    expect(resolveHttpErrorPayload(exception)).toEqual({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Service unavailable',
    });
  });

  it('uses a safe fallback for an unrecognized response shape', () => {
    const exception = new HttpException({ unexpected: true }, 418);

    expect(resolveHttpErrorPayload(exception)).toEqual({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Unexpected error',
    });
  });
});

describe('AllExceptionsFilter', () => {
  let logger: jest.Mocked<Pick<Logger, 'warn' | 'error'>>;
  let response: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let host: ArgumentsHost;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    host = new ExecutionContextHost([jest.fn(), response, jest.fn()]);
    filter = new AllExceptionsFilter(logger as unknown as Logger);
  });

  it('never leaks details from a non-HttpException', () => {
    filter.catch(new Error('database password leaked'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Internal server error',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'database password leaked',
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it('logs security-relevant 4xx responses at warn', () => {
    filter.catch(new ForbiddenException(), host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not warn for an ordinary 400 response', () => {
    filter.catch(new BadRequestException(), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
