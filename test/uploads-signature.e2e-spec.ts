/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/admin/uploads/signature (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    ({ app } = await createCatalogTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires auth and Manager+ role', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/uploads/signature')
      .send({ folder: 'products' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/admin/uploads/signature')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ folder: 'products' })
      .expect(403);
  });

  it('returns signed upload parameters for a valid folder', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/uploads/signature')
      .set(authHeader(TEST_TOKENS.manager))
      .send({ folder: 'products' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          signature: 'fake-signature',
          folder: 'products',
          allowedFormats: 'jpg,jpeg,png,webp',
        });
        // apiKey/cloudName come from the environment's Cloudinary config —
        // assert presence, not exact values.
        expect(body.data.apiKey).toEqual(expect.any(String));
        expect(body.data.apiKey).not.toHaveLength(0);
        expect(body.data.cloudName).toEqual(expect.any(String));
        expect(body.data.cloudName).not.toHaveLength(0);
        expect(typeof body.data.timestamp).toBe('number');
      });
  });

  it('rejects unsupported folders with 422', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/uploads/signature')
      .set(authHeader(TEST_TOKENS.manager))
      .send({ folder: 'avatars' })
      .expect(422);
  });
});
