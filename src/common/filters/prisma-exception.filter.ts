import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client';
import { ERROR_CODES, type ErrorCode } from '../constants/error-codes';

interface PrismaErrorMapping {
  code: ErrorCode;
  message: string;
  status: HttpStatus;
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapping = this.mapException(exception);

    if (mapping.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { err: exception, prismaCode: exception.code },
        mapping.message,
      );
    } else {
      this.logger.warn(
        { err: exception, prismaCode: exception.code },
        mapping.message,
      );
    }

    response.status(mapping.status).json({
      status: 'error',
      message: mapping.message,
      code: mapping.code,
    });
  }

  private mapException(
    exception: Prisma.PrismaClientKnownRequestError,
  ): PrismaErrorMapping {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const formattedTarget = Array.isArray(target)
          ? target.join(', ')
          : typeof target === 'string'
            ? target
            : undefined;

        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.DUPLICATE_RESOURCE,
          message: formattedTarget
            ? `Duplicate resource (${formattedTarget})`
            : 'Duplicate resource',
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: ERROR_CODES.RESOURCE_NOT_FOUND,
          message: 'Resource not found',
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: ERROR_CODES.FOREIGN_KEY_CONSTRAINT,
          message: 'Foreign key constraint violation',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Internal server error',
        };
    }
  }
}
