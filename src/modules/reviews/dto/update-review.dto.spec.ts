import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { validationExceptionFactory } from '../../../common/pipes/validation-exception-factory';
import { CreateReviewDto } from './create-review.dto';
import { UpdateReviewDto } from './update-review.dto';

describe('Review DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: validationExceptionFactory,
  });

  it('rejects null update title and ratings with VALIDATION_ERROR', async () => {
    await expectValidationError({ title: null }, 'title');
    await expectValidationError({ ratings: null }, 'ratings');
  });

  it('allows an omitted create title', async () => {
    await expect(
      pipe.transform(
        { ratings: 4 },
        { type: 'body', metatype: CreateReviewDto },
      ),
    ).resolves.toMatchObject({ ratings: 4 });
  });

  async function expectValidationError(
    value: Record<string, unknown>,
    field: string,
  ) {
    try {
      await pipe.transform(value, { type: 'body', metatype: UpdateReviewDto });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      const response: unknown = (
        error as UnprocessableEntityException
      ).getResponse();
      expect(isValidationResponse(response)).toBe(true);
      if (!isValidationResponse(response)) {
        throw new Error('Expected validation error response');
      }
      expect(response.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(response.message).toBe('Validation failed');
      expect(response.errors.some((entry) => entry.field === field)).toBe(true);
    }
  }
});

function isValidationResponse(value: unknown): value is {
  code: string;
  message: string;
  errors: Array<{ field: string }>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'errors' in value &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    Array.isArray(value.errors)
  );
}
