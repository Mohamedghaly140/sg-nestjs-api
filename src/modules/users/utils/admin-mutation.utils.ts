import { isClerkAPIResponseError } from '@clerk/backend/errors';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Logger } from 'nestjs-pino';
import { ERROR_CODES } from '../../../common/constants/error-codes';

export function assertNotSelf(actingId: string, targetId: string): void {
  if (actingId === targetId) {
    throw new ConflictException({
      code: ERROR_CODES.SELF_MODIFICATION_FORBIDDEN,
      message: 'You cannot modify your own account through admin actions',
    });
  }
}

export function logAdminMutation(
  logger: Logger,
  action: string,
  actingId: string,
  targetId: string,
  details: Record<string, unknown> = {},
): void {
  logger.log(
    { audit: true, action, actingId, targetId, ...details },
    `Admin user action: ${action}`,
  );
}

export function logCriticalCompensationFailure(
  logger: Logger,
  action: string,
  actingId: string,
  targetId: string,
  intendedState: Record<string, unknown>,
  actualState: Record<string, unknown>,
  error: unknown,
): void {
  logger.error(
    {
      audit: true,
      severity: 'CRITICAL',
      action,
      actingId,
      targetId,
      intendedState,
      actualState,
      err: error,
    },
    'Admin identity compensation failed',
  );
}

export function isClerkNotFound(error: unknown): boolean {
  return isClerkAPIResponseError(error) && error.status === 404;
}

export function toValidationException(
  error: unknown,
): UnprocessableEntityException | undefined {
  if (
    !isClerkAPIResponseError(error) ||
    error.status < 400 ||
    error.status >= 500
  ) {
    return undefined;
  }

  const clerkError = error.errors[0];
  return new UnprocessableEntityException({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: clerkError?.longMessage ?? clerkError?.message ?? error.message,
  });
}
