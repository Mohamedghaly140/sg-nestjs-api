import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { ApiSuccessResponse } from '../interfaces/api-response';

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> & { data: unknown; meta: unknown } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.hasOwn(value, 'data') &&
    Object.hasOwn(value, 'meta')
  );
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor<
  unknown,
  ApiSuccessResponse<unknown>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiSuccessResponse<unknown>> {
    return next.handle().pipe(
      map((payload: unknown): ApiSuccessResponse<unknown> => {
        if (isPlainObject(payload)) {
          return {
            status: 'success',
            message:
              typeof payload.message === 'string' ? payload.message : 'Success',
            data: payload.data,
            meta: payload.meta,
          };
        }

        return {
          status: 'success',
          message: 'Success',
          data: payload ?? null,
        };
      }),
    );
  }
}
