import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/utils/configure-app';
import { Role } from '../src/generated/prisma/client';
import { CLERK_CLIENT } from '../src/modules/auth/clerk-client.provider';
import { ClerkTokenVerifierService } from '../src/modules/auth/services/clerk-token-verifier.service';
import { ResetPasswordMailService } from '../src/modules/users/services/reset-password-mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  createFakeClerkClient,
  FakeClerkTokenVerifierService,
  TEST_TOKENS,
} from './support/clerk-test-utils';

describe('/admin/users (e2e)', () => {
  const targetId = 'user_e2e_admin_target';
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const clerk = createFakeClerkClient();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClerkTokenVerifierService)
      .useClass(FakeClerkTokenVerifierService)
      .overrideProvider(CLERK_CLIENT)
      .useValue(clerk)
      .overrideProvider(ResetPasswordMailService)
      .useValue({
        sendPasswordResetNotice: jest.fn().mockResolvedValue(undefined),
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app, ['http://localhost:3000']);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.upsert({
      where: { id: targetId },
      update: {
        email: 'admin-target.e2e@sgcouture.test',
        name: 'Admin Target',
        phone: '+201000000099',
        role: Role.USER,
        active: true,
      },
      create: {
        id: targetId,
        email: 'admin-target.e2e@sgcouture.test',
        name: 'Admin Target',
        phone: '+201000000099',
      },
    });
  });

  afterEach(async () => {
    clerk.users.updateUserMetadata.mockClear();
    await prisma.user.update({
      where: { id: targetId },
      data: { role: Role.USER, active: true },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: targetId } });
    await app.close();
  });

  it('allows MANAGER list/detail but forbids role and status changes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${targetId}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/role`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ role: Role.MANAGER })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/status`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ active: false })
      .expect(403);
  });

  it('allows ADMIN mutations and mirrors roles through updateUserMetadata', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/role`)
      .set(authHeader(TEST_TOKENS.admin))
      .send({ role: Role.MANAGER })
      .expect(200);
    expect(clerk.users.updateUserMetadata).toHaveBeenCalledWith(targetId, {
      publicMetadata: { role: Role.MANAGER },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}/status`)
      .set(authHeader(TEST_TOKENS.admin))
      .send({ active: false })
      .expect(200);
  });

  it('rejects ADMIN self-modification', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user_seed_admin/role')
      .set(authHeader(TEST_TOKENS.admin))
      .send({ role: Role.USER })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'SELF_MODIFICATION_FORBIDDEN',
        }),
      );
  });

  it('enforces reset target role and resets USER targets', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/users/user_seed_admin/reset-password')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'FORBIDDEN_TARGET' }),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${targetId}/reset-password`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toEqual({ sent: true }),
      );
    expect(clerk.users.updateUser).toHaveBeenCalledWith(
      targetId,
      expect.objectContaining({ signOutOfOtherSessions: true }),
    );
  });
});
