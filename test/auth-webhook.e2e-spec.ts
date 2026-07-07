import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/utils/configure-app';
import { CLERK_CLIENT } from '../src/modules/auth/clerk-client.provider';
import { ClerkTokenVerifierService } from '../src/modules/auth/services/clerk-token-verifier.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createFakeClerkClient,
  FakeClerkTokenVerifierService,
  signClerkPayload,
} from './support/clerk-test-utils';

describe('Clerk webhook (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClerkTokenVerifierService)
      .useClass(FakeClerkTokenVerifierService)
      .overrideProvider(CLERK_CLIENT)
      .useValue(createFakeClerkClient())
      .compile();
    app = module.createNestApplication({ rawBody: true });
    configureApp(app, ['http://localhost:3000']);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: 'user_e2e_webhook' } });
    await app.close();
  });

  it('rejects an invalid signature', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/clerk')
      .set({
        'svix-id': 'msg_bad',
        'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
        'svix-signature': 'v1,bad',
      })
      .send({})
      .expect(401)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' }),
      );
  });

  it('accepts a signed event and makes replay idempotent', async () => {
    const payload = JSON.stringify({
      type: 'user.created',
      data: {
        id: 'user_e2e_webhook',
        first_name: 'Webhook',
        last_name: 'User',
        primary_email_address_id: 'email_e2e',
        primary_phone_number_id: null,
        email_addresses: [
          { id: 'email_e2e', email_address: 'webhook.e2e@sgcouture.test' },
        ],
        phone_numbers: [],
      },
      object: 'event',
    });
    const headers = signClerkPayload(payload);

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/clerk')
      .set(headers)
      .set('content-type', 'application/json')
      .send(payload)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/clerk')
      .set(headers)
      .set('content-type', 'application/json')
      .send(payload)
      .expect(200);

    await expect(
      prisma.user.count({ where: { id: 'user_e2e_webhook' } }),
    ).resolves.toBe(1);
  });
});
