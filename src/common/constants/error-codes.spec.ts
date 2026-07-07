import { DEFAULT_ERROR_CODE_BY_STATUS, ERROR_CODES } from './error-codes';

describe('error codes', () => {
  it('contains the complete stable error-code set with matching keys and values', () => {
    const expectedCodes = [
      'BAD_REQUEST',
      'UNAUTHENTICATED',
      'INVALID_WEBHOOK_SIGNATURE',
      'FORBIDDEN',
      'FORBIDDEN_TARGET',
      'ACCOUNT_DISABLED',
      'RESOURCE_NOT_FOUND',
      'CLAIM_TOKEN_INVALID',
      'DUPLICATE_RESOURCE',
      'INSUFFICIENT_STOCK',
      'COUPON_EXHAUSTED',
      'COUPON_USER_LIMIT',
      'REVIEW_EXISTS',
      'PRODUCT_IN_USE',
      'INVALID_STATUS_TRANSITION',
      'SELF_MODIFICATION_FORBIDDEN',
      'LAST_ADMIN_REQUIRED',
      'FOREIGN_KEY_CONSTRAINT',
      'VALIDATION_ERROR',
      'CART_EMPTY',
      'SHIPPING_NOT_AVAILABLE',
      'COUPON_EXPIRED',
      'COUPON_INACTIVE',
      'SUBCATEGORY_CATEGORY_MISMATCH',
      'INVALID_VARIANT',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
    ];

    expect(Object.keys(ERROR_CODES)).toEqual(expectedCodes);
    expect(
      Object.entries(ERROR_CODES).every(([key, value]) => key === value),
    ).toBe(true);
  });

  it('maps every documented default HTTP status', () => {
    expect(DEFAULT_ERROR_CODE_BY_STATUS).toEqual({
      400: ERROR_CODES.BAD_REQUEST,
      401: ERROR_CODES.UNAUTHENTICATED,
      403: ERROR_CODES.FORBIDDEN,
      404: ERROR_CODES.RESOURCE_NOT_FOUND,
      409: ERROR_CODES.DUPLICATE_RESOURCE,
      422: ERROR_CODES.VALIDATION_ERROR,
      429: ERROR_CODES.RATE_LIMITED,
      500: ERROR_CODES.INTERNAL_ERROR,
      503: ERROR_CODES.SERVICE_UNAVAILABLE,
    });
  });
});
