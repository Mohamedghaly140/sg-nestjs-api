import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createCatalogTestApp } from './support/catalog-test-app';

// Kept in its own file/app instance (fresh in-memory ThrottlerStorage) so the
// deliberate burst of requests here can't consume the shared 10/min budget
// used by the functional assertions in coupons-validate.e2e-spec.ts.
describe('/coupons/validate throttling (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createCatalogTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('throttles POST /coupons/validate past 10 requests/min', async () => {
    const responses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/coupons/validate')
        .send({ code: 'DOES_NOT_EXIST' });
      responses.push(response.status);
    }

    expect(responses.slice(0, 10)).toEqual(new Array(10).fill(404));
    expect(responses[10]).toBe(429);
  }, 15000);
});
