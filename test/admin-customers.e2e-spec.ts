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

describe('/admin/customers (e2e)', () => {
  const customerTargetId = 'user_e2e_customer_target';
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
    await resetCustomerTarget();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetCustomerTarget();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: customerTargetId } });
    await app.close();
  });

  async function resetCustomerTarget() {
    await prisma.user.upsert({
      where: { id: customerTargetId },
      update: {
        email: 'customer-target.e2e@sgcouture.test',
        name: 'Customer Target',
        phone: '+201000000088',
        role: Role.USER,
        active: true,
      },
      create: {
        id: customerTargetId,
        email: 'customer-target.e2e@sgcouture.test',
        name: 'Customer Target',
        phone: '+201000000088',
        role: Role.USER,
        active: true,
      },
    });
  }

  it('forbids CUSTOMER on all customer administration routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/customers')
      .set(authHeader(TEST_TOKENS.customer))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/admin/customers/${customerTargetId}`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/customers/${customerTargetId}/active`)
      .set(authHeader(TEST_TOKENS.customer))
      .send({ active: false })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/customers/${customerTargetId}/reset-password`)
      .set(authHeader(TEST_TOKENS.customer))
      .expect(403);
  });

  it('lets MANAGER list only USER rows with order counts', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/customers')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        const data = (
          body as {
            data: Array<{ role?: Role; ordersCount: number; id: string }>;
          }
        ).data;
        expect(data.some((user) => user.id === 'user_seed_customer')).toBe(
          true,
        );
        expect(data.some((user) => user.id === 'user_seed_manager')).toBe(
          false,
        );
        expect(data.every((user) => typeof user.ordersCount === 'number')).toBe(
          true,
        );
      });
  });

  it('returns 404 for staff IDs on customer detail', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/customers/user_seed_manager')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(404);
  });

  it('returns customer detail with addresses and order summaries', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/customers/user_seed_customer')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) => {
        const data = (
          body as {
            data: {
              id: string;
              role: Role;
              addresses: unknown;
              orders: Array<{ humanOrderId: string; itemsCount: number }>;
            };
          }
        ).data;
        expect(data.id).toBe('user_seed_customer');
        expect(data.role).toBe(Role.USER);
        expect(Array.isArray(data.addresses)).toBe(true);
        expect(data.orders).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              humanOrderId: 'ORD-900001',
              itemsCount: 1,
            }),
          ]),
        );
      });
  });

  it('flips customer activation in DB after Clerk ban and unban', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/customers/${customerTargetId}/active`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ active: false })
      .expect(200)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toEqual({
          id: customerTargetId,
          active: false,
        }),
      );
    expect(clerk.users.banUser).toHaveBeenCalledWith(customerTargetId);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/customers/${customerTargetId}/active`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ active: true })
      .expect(200);
    expect(clerk.users.unbanUser).toHaveBeenCalledWith(customerTargetId);
  });

  it('rejects self and staff activation targets', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/customers/user_seed_manager/active')
      .set(authHeader(TEST_TOKENS.manager))
      .send({ active: false })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'SELF_MODIFICATION_FORBIDDEN' }),
      );

    await request(app.getHttpServer())
      .patch('/api/v1/admin/customers/user_seed_admin/active')
      .set(authHeader(TEST_TOKENS.manager))
      .send({ active: false })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'FORBIDDEN_TARGET' }),
      );
  });

  it('leaves DB active unchanged when Clerk ban fails', async () => {
    clerk.users.banUser.mockRejectedValueOnce(new Error('Clerk down'));

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/customers/${customerTargetId}/active`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ active: false })
      .expect(500);

    await expect(
      prisma.user.findUnique({ where: { id: customerTargetId } }),
    ).resolves.toMatchObject({ active: true });
  });

  it('enforces reset target role and resets USER targets', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/customers/user_seed_admin/reset-password')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'FORBIDDEN_TARGET' }),
      );

    await request(app.getHttpServer())
      .post(`/api/v1/admin/customers/${customerTargetId}/reset-password`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(200)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toEqual({ sent: true }),
      );
    expect(clerk.users.updateUser).toHaveBeenCalledWith(
      customerTargetId,
      expect.objectContaining({ signOutOfOtherSessions: true }),
    );
  });
});
