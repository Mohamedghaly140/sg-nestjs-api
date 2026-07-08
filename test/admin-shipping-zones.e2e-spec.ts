/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { authHeader, TEST_TOKENS } from './support/clerk-test-utils';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/admin/shipping-zones (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  async function cleanup() {
    await prisma.shippingZone.deleteMany({
      where: { country: 'E2E Shipping Egypt' },
    });
  }

  it('requires Manager+ and performs CRUD', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/shipping-zones')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(403);

    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/shipping-zones')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        country: 'E2E Shipping Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        fee: 65,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/admin/shipping-zones?search=E2E%20Shipping')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/shipping-zones/${created.body.data.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ fee: 75, isActive: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.fee).toBe('75');
        expect(body.data.isActive).toBe(false);
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/shipping-zones/${created.body.data.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(204);
  });

  it('does not re-enable a deactivated zone on a fee-only PATCH', async () => {
    const zone = await prisma.shippingZone.create({
      data: {
        country: 'E2E Shipping Egypt',
        governorate: 'Alexandria',
        city: 'Smouha',
        fee: '50.00',
        isActive: false,
      },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/shipping-zones/${zone.id}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ fee: 55 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.fee).toBe('55');
        expect(body.data.isActive).toBe(false);
      });
  });

  it('returns duplicate conflicts for city-specific and governorate-wide unique indexes', async () => {
    await prisma.shippingZone.create({
      data: {
        country: 'E2E Shipping Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        fee: '65.00',
      },
    });
    await prisma.shippingZone.create({
      data: {
        country: 'E2E Shipping Egypt',
        governorate: 'Giza',
        city: null,
        fee: '80.00',
      },
    });

    await request(app.getHttpServer())
      .post('/api/v1/admin/shipping-zones')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        country: 'E2E Shipping Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
        fee: 65,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/admin/shipping-zones')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        country: 'E2E Shipping Egypt',
        governorate: 'Giza',
        fee: 80,
      })
      .expect(409);
  });
});
