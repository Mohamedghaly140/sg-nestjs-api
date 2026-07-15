import { ClerkAPIResponseError } from '@clerk/backend/errors';
import { Role } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClerkClient } from '../auth/clerk-client.provider';
import { AdminUsersService } from './admin-users.service';

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

describe('AdminUsersService', () => {
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      upsert: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const clerk = {
    users: {
      createUser: jest.fn(),
      deleteUser: jest.fn(),
      updateUserMetadata: jest.fn(),
      banUser: jest.fn(),
      unbanUser: jest.fn(),
    },
  };
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };
  const service = new AdminUsersService(
    prisma as unknown as PrismaService,
    clerk as unknown as ClerkClient,
    logger as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('lists users across roles and excludes phone from search', async () => {
    prisma.user.findMany.mockResolvedValueOnce([]);
    prisma.user.count.mockResolvedValueOnce(0);

    await expect(
      service.listUsers({
        page: 1,
        limit: 20,
        search: 'mariam',
        role: Role.MANAGER,
        active: true,
      }),
    ).resolves.toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'mariam', mode: 'insensitive' } },
            { email: { contains: 'mariam', mode: 'insensitive' } },
          ],
          role: Role.MANAGER,
          active: true,
        },
      }),
    );
  });

  it('creates a Clerk user then upserts role in both DB branches', async () => {
    const createdAt = new Date('2026-07-06T12:00:00.000Z');
    clerk.users.createUser.mockResolvedValueOnce({ id: 'user_clerk_new' });
    prisma.user.upsert.mockResolvedValueOnce({
      id: 'user_clerk_new',
      name: 'Mo Test',
      email: 'mo+test@example.com',
      phone: '+201000000050',
      role: Role.MANAGER,
      active: true,
      createdAt,
    });

    await expect(
      service.createUser('admin_1', {
        firstName: 'Mary Anne',
        lastName: 'Test',
        email: 'mo+test@example.com',
        phone: '+201000000050',
        password: 'Str0ngPass!2026',
        role: Role.MANAGER,
      }),
    ).resolves.toMatchObject({ id: 'user_clerk_new', role: Role.MANAGER });
    expect(clerk.users.createUser).toHaveBeenCalledWith({
      emailAddress: ['mo+test@example.com'],
      phoneNumber: ['+201000000050'],
      username: 'mo_test',
      password: 'Str0ngPass!2026',
      firstName: 'Mary Anne',
      lastName: 'Test',
      publicMetadata: { role: Role.MANAGER },
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'user_clerk_new' },
      update: {
        email: 'mo+test@example.com',
        name: 'Mary Anne Test',
        phone: '+201000000050',
        role: Role.MANAGER,
      },
      create: {
        id: 'user_clerk_new',
        email: 'mo+test@example.com',
        name: 'Mary Anne Test',
        phone: '+201000000050',
        role: Role.MANAGER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
  });

  it('maps Clerk 4xx create failures to VALIDATION_ERROR without DB upsert', async () => {
    clerk.users.createUser.mockRejectedValueOnce(clerkError(422, 'Duplicate'));

    await expect(
      service.createUser('admin_1', {
        firstName: 'Mo',
        lastName: 'Test',
        email: 'mo@example.com',
        phone: '+201000000050',
        password: 'Str0ngPass!2026',
        role: Role.USER,
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        code: 'VALIDATION_ERROR',
        message: 'Detailed Duplicate',
      },
    });
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('compensates Clerk create when DB upsert fails', async () => {
    const dbError = new Error('db down');
    clerk.users.createUser.mockResolvedValueOnce({ id: 'user_clerk_new' });
    clerk.users.deleteUser.mockResolvedValueOnce({});
    prisma.user.upsert.mockRejectedValueOnce(dbError);

    await expect(
      service.createUser('admin_1', {
        firstName: 'Mo',
        lastName: 'Test',
        email: 'mo@example.com',
        phone: '+201000000050',
        password: 'Str0ngPass!2026',
        role: Role.USER,
      }),
    ).rejects.toBe(dbError);
    expect(clerk.users.deleteUser).toHaveBeenCalledWith('user_clerk_new');
  });

  it('logs CRITICAL when create compensation fails', async () => {
    clerk.users.createUser.mockResolvedValueOnce({ id: 'user_clerk_new' });
    clerk.users.deleteUser.mockRejectedValueOnce(new Error('delete failed'));
    prisma.user.upsert.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.createUser('admin_1', {
        firstName: 'Mo',
        lastName: 'Test',
        email: 'mo@example.com',
        phone: '+201000000050',
        password: 'Str0ngPass!2026',
        role: Role.USER,
      }),
    ).rejects.toThrow('db down');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'CRITICAL' }),
      'Admin identity compensation failed',
    );
  });

  it('rejects self updates before lookup or Clerk calls', async () => {
    await expect(
      service.updateUser('admin_1', 'admin_1', {
        role: Role.USER,
        active: false,
      }),
    ).rejects.toMatchObject({
      response: { code: 'SELF_MODIFICATION_FORBIDDEN' },
    });
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(clerk.users.updateUserMetadata).not.toHaveBeenCalled();
  });

  it('rejects last active admin updates before Clerk writes', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'admin_2',
      role: Role.ADMIN,
      active: true,
      name: 'Admin Two',
      email: 'admin2@test.dev',
      phone: '+201000000002',
      createdAt: new Date(),
    });
    prisma.user.count.mockResolvedValueOnce(0);

    await expect(
      service.updateUser('admin_1', 'admin_2', {
        role: Role.MANAGER,
        active: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'LAST_ADMIN_REQUIRED' },
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        role: Role.ADMIN,
        active: true,
        id: { not: 'admin_2' },
      },
    });
    expect(clerk.users.updateUserMetadata).not.toHaveBeenCalled();
  });

  it('does not run last-admin count when the target remains active ADMIN', async () => {
    const previous = {
      id: 'admin_2',
      role: Role.ADMIN,
      active: true,
      name: 'Admin Two',
      email: 'admin2@test.dev',
      phone: '+201000000002',
      createdAt: new Date(),
    };
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce(previous);
    prisma.user.update.mockResolvedValueOnce(previous);

    await service.updateUser('admin_1', 'admin_2', {
      role: Role.ADMIN,
      active: true,
    });
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('does not ban or update DB when Clerk metadata fails', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.updateUserMetadata.mockRejectedValueOnce(new Error('metadata'));

    await expect(
      service.updateUser('admin_1', 'user_1', {
        role: Role.MANAGER,
        active: false,
      }),
    ).rejects.toThrow('metadata');
    expect(clerk.users.banUser).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('reverts metadata and skips DB when ban fails after role change', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.updateUserMetadata.mockResolvedValueOnce({});
    clerk.users.banUser.mockRejectedValueOnce(new Error('ban'));
    clerk.users.updateUserMetadata.mockResolvedValueOnce({});

    await expect(
      service.updateUser('admin_1', 'user_1', {
        role: Role.MANAGER,
        active: false,
      }),
    ).rejects.toThrow('ban');
    expect(clerk.users.updateUserMetadata).toHaveBeenLastCalledWith('user_1', {
      publicMetadata: { role: Role.USER },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('reverts both Clerk active and role writes when DB update fails', async () => {
    const dbError = new Error('db down');
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.updateUserMetadata.mockResolvedValue({});
    clerk.users.banUser.mockResolvedValueOnce({});
    clerk.users.unbanUser.mockResolvedValueOnce({});
    prisma.user.update.mockRejectedValueOnce(dbError);

    await expect(
      service.updateUser('admin_1', 'user_1', {
        role: Role.MANAGER,
        active: false,
      }),
    ).rejects.toBe(dbError);
    expect(clerk.users.unbanUser).toHaveBeenCalledWith('user_1');
    expect(clerk.users.updateUserMetadata).toHaveBeenLastCalledWith('user_1', {
      publicMetadata: { role: Role.USER },
    });
  });

  it('skips metadata calls when role is unchanged', async () => {
    const user = {
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    };
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);
    clerk.users.banUser.mockResolvedValueOnce({});
    prisma.user.update.mockResolvedValueOnce({ ...user, active: false });

    await service.updateUser('admin_1', 'user_1', {
      role: Role.USER,
      active: false,
    });
    expect(clerk.users.updateUserMetadata).not.toHaveBeenCalled();
    expect(clerk.users.banUser).toHaveBeenCalledWith('user_1');
  });

  it('rejects self deletes', async () => {
    await expect(
      service.deleteUser('admin_1', 'admin_1'),
    ).rejects.toMatchObject({
      response: { code: 'SELF_MODIFICATION_FORBIDDEN' },
    });
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects deleting the last active admin', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'admin_2',
      role: Role.ADMIN,
      active: true,
      name: 'Admin Two',
      email: 'admin2@test.dev',
      phone: '+201000000002',
      createdAt: new Date(),
    });
    prisma.user.count.mockResolvedValueOnce(0);

    await expect(
      service.deleteUser('admin_1', 'admin_2'),
    ).rejects.toMatchObject({
      response: { code: 'LAST_ADMIN_REQUIRED' },
    });
    expect(clerk.users.deleteUser).not.toHaveBeenCalled();
  });

  it('tolerates Clerk 404 on delete and proceeds to DB delete', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.deleteUser.mockRejectedValueOnce(clerkError(404, 'Not found'));
    prisma.user.deleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      service.deleteUser('admin_1', 'user_1'),
    ).resolves.toBeUndefined();
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'user_1' },
    });
  });

  it('succeeds when the user.deleted webhook already removed the row', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.deleteUser.mockResolvedValueOnce({});
    prisma.user.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.deleteUser('admin_1', 'user_1'),
    ).resolves.toBeUndefined();
  });

  it('aborts DB delete on non-404 Clerk delete errors', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.deleteUser.mockRejectedValueOnce(clerkError(500, 'Clerk down'));

    await expect(service.deleteUser('admin_1', 'user_1')).rejects.toMatchObject(
      {
        status: 500,
      },
    );
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it('does not compensate Clerk delete when DB delete fails', async () => {
    const dbError = new Error('db down');
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      createdAt: new Date(),
    });
    clerk.users.deleteUser.mockResolvedValueOnce({});
    prisma.user.deleteMany.mockRejectedValueOnce(dbError);

    await expect(service.deleteUser('admin_1', 'user_1')).rejects.toBe(dbError);
    expect(clerk.users.deleteUser).toHaveBeenCalledTimes(1);
  });
});
