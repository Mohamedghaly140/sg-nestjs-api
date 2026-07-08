/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createCatalogTestApp } from './support/catalog-test-app';

describe('/shipping/fee (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createCatalogTestApp());
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.shippingZone.createMany({
      data: [
        {
          country: 'E2E Shipping Egypt',
          governorate: 'Cairo',
          city: null,
          fee: '90.00',
        },
        {
          country: 'E2E Shipping Egypt',
          governorate: 'Cairo',
          city: 'Nasr City',
          fee: '65.00',
        },
        {
          country: 'E2E Shipping Egypt',
          governorate: 'Giza',
          city: null,
          fee: '80.00',
          isActive: false,
        },
      ],
    });
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

  it('uses city-specific fees before governorate fallback', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/shipping/fee')
      .query({
        country: 'E2E Shipping Egypt',
        governorate: 'Cairo',
        city: 'Nasr City',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          fee: '65.00',
          zone: { city: 'Nasr City' },
        });
      });

    await request(app.getHttpServer())
      .get('/api/v1/shipping/fee')
      .query({
        country: 'E2E Shipping Egypt',
        governorate: 'Cairo',
        city: 'Maadi',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({
          fee: '90.00',
          zone: { city: null },
        });
      });
  });

  it('returns 422 when only inactive or missing zones exist', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/shipping/fee')
      .query({ country: 'E2E Shipping Egypt', governorate: 'Giza' })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('SHIPPING_NOT_AVAILABLE'));
  });
});
