import { ERROR_CODES } from '../constants/error-codes';
import { validationExceptionFactory } from './validation-exception-factory';

describe('validationExceptionFactory', () => {
  it('creates the documented 422 validation payload', () => {
    const exception = validationExceptionFactory([
      {
        property: 'name',
        constraints: {
          isString: 'name must be a string',
        },
      },
    ]);

    expect(exception.getStatus()).toBe(422);
    expect(exception.getResponse()).toEqual({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Validation failed',
      errors: [
        {
          field: 'name',
          constraints: {
            isString: 'name must be a string',
          },
        },
      ],
    });
  });

  it('flattens nested children into dotted field paths', () => {
    const exception = validationExceptionFactory([
      {
        property: 'address',
        children: [
          {
            property: 'city',
            constraints: {
              isNotEmpty: 'city should not be empty',
            },
          },
          {
            property: 'coordinates',
            children: [
              {
                property: 'latitude',
                constraints: {
                  isNumber: 'latitude must be a number',
                },
              },
            ],
          },
        ],
      },
    ]);

    expect(exception.getResponse()).toMatchObject({
      errors: [
        {
          field: 'address.city',
          constraints: {
            isNotEmpty: 'city should not be empty',
          },
        },
        {
          field: 'address.coordinates.latitude',
          constraints: {
            isNumber: 'latitude must be a number',
          },
        },
      ],
    });
  });
});
