import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductDto } from './update-product.dto';

describe('UpdateProductDto', () => {
  it('rejects null gallery images instead of treating them as omitted', async () => {
    const errors = await validate(
      plainToInstance(UpdateProductDto, { images: null }),
    );

    const imagesError = errors.find((error) => error.property === 'images');

    expect(imagesError?.constraints?.isArray).toBe('images must be an array');
  });

  it('rejects null price instead of treating it as omitted', async () => {
    const errors = await validate(
      plainToInstance(UpdateProductDto, { price: null }),
    );

    const priceError = errors.find((error) => error.property === 'price');

    expect(typeof priceError?.constraints?.isNumber).toBe('string');
    expect(typeof priceError?.constraints?.min).toBe('string');
  });

  it('allows price to be omitted', async () => {
    const errors = await validate(plainToInstance(UpdateProductDto, {}));

    expect(errors).toHaveLength(0);
  });

  it('allows a valid price', async () => {
    const errors = await validate(
      plainToInstance(UpdateProductDto, { price: 5 }),
    );

    expect(errors).toHaveLength(0);
  });
});
