import { ClerkAPIResponseError } from '@clerk/backend/errors';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/utils/configure-app';
import { Role } from '../src/generated/prisma/client';
import { CLERK_CLIENT } from '../src/modules/auth/clerk-client.provider';
import { ClerkTokenVerifierService } from '../src/modules/auth/services/clerk-token-verifier.service';
import { AdminUsersService } from '../src/modules/users/admin-users.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  authHeader,
  createFakeClerkClient,
  FakeClerkTokenVerifierService,
  TEST_TOKENS,
} from './support/clerk-test-utils';

function clerkError(status: number, message = 'Clerk rejected request') {
  return new ClerkAPIResponseError(message, {
    data: [
      {
        code: 'form_identifier_exists',
        message,
        long_message: `Detailed ${message}`,
      },
    ],
    status,
  });
}

describe('/admin/users (e2e)', () => {
  const targetId = 'user_e2e_admin_target';
  const createdId = 'user_e2e_admin_created';
  const dbOnlyId = 'user_e2e_db_only_delete';
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminUsers: AdminUsersService;
  const clerk = createFakeClerkClient();

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClerkTokenVerifierService)
      .useClass(FakeClerkTokenVerifierService)
      .overrideProvider(CLERK_CLIENT)
      .useValue(clerk)
      .compile();
    app = module.createNestApplication();
    configureApp(app, ['http://localhost:3000']);
    await app.init();
    prisma = app.get(PrismaService);
    adminUsers = app.get(AdminUsersService);
    await resetTarget();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetTarget();
    await prisma.user.deleteMany({
      where: { id: { in: [createdId, dbOnlyId] } },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [targetId, createdId, dbOnlyId] } },
    });
    await app.close();
  });

  async function resetTarget() {
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
        role: Role.USER,
        active: true,
      },
    });
  }

  it('forbids MANAGER on every staff-management route', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(authHeader(TEST_TOKENS.manager))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set(authHeader(TEST_TOKENS.manager))
      .send({
        name: 'Blocked User',
        email: 'blocked.e2e@sgcouture.test',
        phone: '+201000000060',
        password: 'Str0ngPass!2026',
        role: Role.USER,
      })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}`)
      .set(authHeader(TEST_TOKENS.manager))
      .send({ role: Role.MANAGER, active: true })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/users/${targetId}`)
      .set(authHeader(TEST_TOKENS.manager))
      .expect(403);
  });

  it('lists all roles and supports role filtering', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        const data = (body as { data: Array<{ role: Role }> }).data;
        expect(data.some((user) => user.role === Role.ADMIN)).toBe(true);
        expect(data.some((user) => user.role === Role.MANAGER)).toBe(true);
        expect(data.some((user) => user.role === Role.USER)).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/api/v1/admin/users?role=MANAGER')
      .set(authHeader(TEST_TOKENS.admin))
      .expect(200)
      .expect(({ body }) => {
        const data = (body as { data: Array<{ role: Role }> }).data;
        expect(data.length).toBeGreaterThan(0);
        expect(data.every((user) => user.role === Role.MANAGER)).toBe(true);
      });
  });

  it('creates a user through Clerk then stores the Clerk-issued ID', async () => {
    clerk.users.createUser.mockResolvedValueOnce({ id: createdId });

    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set(authHeader(TEST_TOKENS.admin))
      .send({
        name: 'Created User',
        email: 'created-user.e2e@sgcouture.test',
        phone: '+201000000060',
        password: 'Str0ngPass!2026',
        role: Role.MANAGER,
      })
      .expect(201)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toMatchObject({
          id: createdId,
          role: Role.MANAGER,
        }),
      );

    expect(clerk.users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: ['created-user.e2e@sgcouture.test'],
        phoneNumber: ['+201000000060'],
        username: 'created-user.e2e',
        publicMetadata: { role: Role.MANAGER },
      }),
    );
    await expect(
      prisma.user.findUnique({ where: { id: createdId } }),
    ).resolves.toMatchObject({ id: createdId, role: Role.MANAGER });
  });

  it('maps Clerk create rejection to 422 without creating a DB row', async () => {
    clerk.users.createUser.mockRejectedValueOnce(clerkError(422, 'Duplicate'));

    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set(authHeader(TEST_TOKENS.admin))
      .send({
        name: 'Rejected User',
        email: 'rejected-user.e2e@sgcouture.test',
        phone: '+201000000061',
        password: 'Str0ngPass!2026',
        role: Role.USER,
      })
      .expect(422)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'VALIDATION_ERROR',
          message: 'Detailed Duplicate',
        }),
      );

    await expect(
      prisma.user.findFirst({
        where: { email: 'rejected-user.e2e@sgcouture.test' },
      }),
    ).resolves.toBeNull();
  });

  it('updates role and active with Clerk writes before DB update', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}`)
      .set(authHeader(TEST_TOKENS.admin))
      .send({ role: Role.MANAGER, active: false })
      .expect(200)
      .expect(({ body }) =>
        expect((body as { data: unknown }).data).toMatchObject({
          role: Role.MANAGER,
          active: false,
        }),
      );

    expect(clerk.users.updateUserMetadata).toHaveBeenCalledWith(targetId, {
      publicMetadata: { role: Role.MANAGER },
    });
    expect(clerk.users.banUser).toHaveBeenCalledWith(targetId);
    await expect(
      prisma.user.findUnique({ where: { id: targetId } }),
    ).resolves.toMatchObject({ role: Role.MANAGER, active: false });
  });

  it('leaves DB unchanged when a Clerk update fails', async () => {
    clerk.users.updateUserMetadata.mockRejectedValueOnce(
      new Error('Clerk down'),
    );

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetId}`)
      .set(authHeader(TEST_TOKENS.admin))
      .send({ role: Role.MANAGER, active: true })
      .expect(500);

    await expect(
      prisma.user.findUnique({ where: { id: targetId } }),
    ).resolves.toMatchObject({ role: Role.USER, active: true });
  });

  it('rejects self update and nonexistent targets', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user_seed_admin')
      .set(authHeader(TEST_TOKENS.admin))
      .send({ role: Role.USER, active: true })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'SELF_MODIFICATION_FORBIDDEN' }),
      );

    await request(app.getHttpServer())
      .patch('/api/v1/admin/users/user_missing_admin')
      .set(authHeader(TEST_TOKENS.admin))
      .send({ role: Role.USER, active: true })
      .expect(404);
  });

  it('deletes DB-only users when Clerk returns 404', async () => {
    await prisma.user.create({
      data: {
        id: dbOnlyId,
        email: 'db-only-delete.e2e@sgcouture.test',
        name: 'DB Only',
        phone: '+201000000062',
        role: Role.USER,
      },
    });
    clerk.users.deleteUser.mockRejectedValueOnce(clerkError(404, 'Not found'));

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/users/${dbOnlyId}`)
      .set(authHeader(TEST_TOKENS.admin))
      .expect(204);

    await expect(
      prisma.user.findUnique({ where: { id: dbOnlyId } }),
    ).resolves.toBeNull();
  });

  it('rejects self delete', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/admin/users/user_seed_admin')
      .set(authHeader(TEST_TOKENS.admin))
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'SELF_MODIFICATION_FORBIDDEN' }),
      );
  });

  it('exercises LAST_ADMIN_REQUIRED directly through the service', async () => {
    await expect(
      adminUsers.updateUser('synthetic_actor', 'user_seed_admin', {
        role: Role.MANAGER,
        active: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'LAST_ADMIN_REQUIRED' },
    });
  });
});
