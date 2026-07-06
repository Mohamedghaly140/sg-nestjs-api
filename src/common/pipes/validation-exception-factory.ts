import { UnprocessableEntityException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ERROR_CODES } from '../constants/error-codes';

interface FlattenedValidationError {
  field: string;
  constraints: Record<string, string>;
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath?: string,
): FlattenedValidationError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const currentError = error.constraints
      ? [{ field, constraints: error.constraints }]
      : [];

    return [
      ...currentError,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    code: ERROR_CODES.VALIDATION_ERROR,
    message: 'Validation failed',
    errors: flattenValidationErrors(errors),
  });
}
