import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';
import {
  DEFAULT_ERROR_CODE_BY_STATUS,
  ERROR_CODES,
} from '../constants/error-codes';

interface HttpErrorPayload {
  code: string;
  message: string;
  errors?: unknown;
}

const DEFAULT_ERROR_MESSAGE_BY_STATUS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthenticated',
  403: 'Forbidden',
  404: 'Resource not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
  503: 'Service unavailable',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function resolveHttpErrorPayload(
  exception: HttpException,
): HttpErrorPayload {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const defaultCode =
    DEFAULT_ERROR_CODE_BY_STATUS[status] ?? ERROR_CODES.INTERNAL_ERROR;

  if (isObject(response) && typeof response.code === 'string') {
    return {
      code: response.code,
      message:
        typeof response.message === 'string'
          ? response.message
          : (DEFAULT_ERROR_MESSAGE_BY_STATUS[status] ?? 'Unexpected error'),
      ...(response.errors === undefined ? {} : { errors: response.errors }),
    };
  }

  if (typeof response === 'string') {
    return { code: defaultCode, message: response };
  }

  if (isObject(response) && typeof response.message === 'string') {
    return { code: defaultCode, message: response.message };
  }

  return {
    code: defaultCode,
    message: DEFAULT_ERROR_MESSAGE_BY_STATUS[status] ?? 'Unexpected error',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = resolveHttpErrorPayload(exception);

      if (status >= 500) {
        this.logger.error({ err: exception }, payload.message);
      } else if (status === 401 || status === 403 || status === 429) {
        this.logger.warn({ err: exception }, payload.message);
      }

      response.status(status).json({
        status: 'error',
        message: payload.message,
        code: payload.code,
        ...(payload.errors === undefined ? {} : { errors: payload.errors }),
      });
      return;
    }

    this.logger.error(
      {
        err: exception,
        stack: exception instanceof Error ? exception.stack : undefined,
      },
      'Unhandled exception',
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Internal server error',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
}
