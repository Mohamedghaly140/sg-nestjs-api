import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();
  const context = {} as ExecutionContext;

  async function intercept(payload: unknown) {
    const next: CallHandler = {
      handle: () => of(payload),
    };

    return firstValueFrom(interceptor.intercept(context, next));
  }

  it('wraps a bare payload in the success envelope', async () => {
    await expect(intercept({ id: 'product_1' })).resolves.toEqual({
      status: 'success',
      message: 'Success',
      data: { id: 'product_1' },
    });
  });

  it('uses data and meta only when both keys are present', async () => {
    const payload = {
      data: ['item'],
      meta: { page: 1 },
      message: 'Items returned',
    };

    await expect(intercept(payload)).resolves.toEqual({
      status: 'success',
      message: 'Items returned',
      data: ['item'],
      meta: { page: 1 },
    });
  });

  it.each([[{ data: ['item'] }], [{ meta: { page: 1 } }]])(
    'wraps the entire payload when one pagination key is absent',
    async (payload) => {
      await expect(intercept(payload)).resolves.toEqual({
        status: 'success',
        message: 'Success',
        data: payload,
      });
    },
  );

  it('normalizes undefined to null', async () => {
    await expect(intercept(undefined)).resolves.toEqual({
      status: 'success',
      message: 'Success',
      data: null,
    });
  });
});
