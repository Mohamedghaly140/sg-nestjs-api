import { Role } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClerkSyncService } from '../auth/services/clerk-sync.service';
import type { ResetPasswordMailService } from './services/reset-password-mail.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = {
    user: {
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    order: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const clerkSync = {
    mirrorRoleToClerk: jest.fn(),
    pushProfileToClerk: jest.fn(),
    setRandomPassword: jest.fn(),
  };
  const mail = { sendPasswordResetNotice: jest.fn() };
  const logger = { log: jest.fn() };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    clerkSync as unknown as ClerkSyncService,
    mail as unknown as ResetPasswordMailService,
    logger as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['role', () => service.updateRole('admin_1', 'admin_1', Role.USER)],
    ['status', () => service.updateStatus('admin_1', 'admin_1', false)],
  ])('rejects self-modification for %s updates', async (_name, action) => {
    await expect(action()).rejects.toMatchObject({
      response: { code: 'SELF_MODIFICATION_FORBIDDEN' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects reset-password for every non-USER target', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'manager_1',
      role: Role.MANAGER,
    });
    await expect(
      service.resetPassword('admin_1', 'manager_1'),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN_TARGET' },
    });
    expect(clerkSync.setRandomPassword).not.toHaveBeenCalled();
  });

  it('builds combined filters and zero-item pagination metadata', async () => {
    prisma.user.findMany.mockResolvedValueOnce([]);
    prisma.user.count.mockResolvedValueOnce(0);

    await expect(
      service.listUsers({
        page: 1,
        limit: 20,
        search: 'mariam',
        role: Role.USER,
        active: false,
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
            { phone: { contains: 'mariam', mode: 'insensitive' } },
          ],
          role: Role.USER,
          active: false,
        },
      }),
    );
  });

  it('changes a USER password before sending the notice', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      email: 'user@test.dev',
      name: 'User One',
      role: Role.USER,
    });
    clerkSync.setRandomPassword.mockResolvedValueOnce(undefined);
    mail.sendPasswordResetNotice.mockResolvedValueOnce(undefined);

    await expect(service.resetPassword('manager_1', 'user_1')).resolves.toEqual(
      { sent: true },
    );
    expect(clerkSync.setRandomPassword).toHaveBeenCalledWith(
      'user_1',
      expect.stringMatching(/Aa1!$/),
    );
    expect(mail.sendPasswordResetNotice).toHaveBeenCalledWith(
      'user@test.dev',
      'User One',
    );
  });
});
