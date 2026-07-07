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
  authHeader,
  createFakeClerkClient,
  FakeClerkTokenVerifierService,
  TEST_TOKENS,
} from './support/clerk-test-utils';

describe('/users/me (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClerkTokenVerifierService)
      .useClass(FakeClerkTokenVerifierService)
      .overrideProvider(CLERK_CLIENT)
      .useValue(createFakeClerkClient())
      .compile();
    app = module.createNestApplication();
    configureApp(app, ['http://localhost:3000']);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.user.update({
      where: { id: 'user_seed_customer' },
      data: {
        name: 'Mariam Hassan',
        phone: '+201000000002',
        active: true,
      },
    });
  });

  afterAll(() => app.close());

  it('gets and updates the current profile', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(200)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toMatchObject({
          id: 'user_seed_customer',
          role: 'USER',
        }),
      );

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ name: 'Mariam Updated' })
      .expect(200)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toMatchObject({
          name: 'Mariam Updated',
        }),
      );
  });

  it('maps a phone uniqueness collision to DUPLICATE_RESOURCE', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set(authHeader(TEST_TOKENS.customer))
      .send({ phone: '+201000000001' })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'DUPLICATE_RESOURCE' }),
      );
  });

  it('returns ACCOUNT_DISABLED for a deactivated authenticated user', async () => {
    await prisma.user.update({
      where: { id: 'user_seed_customer' },
      data: { active: false },
    });

    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(403)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'ACCOUNT_DISABLED' }),
      );
  });
});
