import { NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ClerkClient } from '../auth/clerk-client.provider';
import type { ClerkSyncService } from '../auth/services/clerk-sync.service';
import { AdminCustomersService } from './admin-customers.service';
import type { ResetPasswordMailService } from './services/reset-password-mail.service';

describe('AdminCustomersService', () => {
  const prisma = {
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const clerk = {
    users: {
      banUser: jest.fn(),
      unbanUser: jest.fn(),
    },
  };
  const clerkSync = {
    setRandomPassword: jest.fn(),
  };
  const mail = {
    sendPasswordResetNotice: jest.fn(),
  };
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };
  const service = new AdminCustomersService(
    prisma as unknown as PrismaService,
    clerk as unknown as ClerkClient,
    clerkSync as unknown as ClerkSyncService,
    mail as unknown as ResetPasswordMailService,
    logger as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('lists only USER customers and searches name, email, and phone', async () => {
    prisma.user.findMany.mockResolvedValueOnce([]);
    prisma.user.count.mockResolvedValueOnce(0);

    await expect(
      service.listCustomers({
        page: 1,
        limit: 20,
        search: 'mariam',
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
          role: Role.USER,
          OR: [
            { name: { contains: 'mariam', mode: 'insensitive' } },
            { email: { contains: 'mariam', mode: 'insensitive' } },
            { phone: { contains: 'mariam', mode: 'insensitive' } },
          ],
          active: false,
        },
      }),
    );
  });

  it('maps customer order counts in the list response', async () => {
    const createdAt = new Date('2026-07-06T12:00:00.000Z');
    prisma.user.findMany.mockResolvedValueOnce([
      {
        id: 'user_1',
        name: 'User One',
        email: 'user@test.dev',
        phone: '+201000000001',
        active: true,
        createdAt,
        _count: { orders: 3 },
      },
    ]);
    prisma.user.count.mockResolvedValueOnce(1);

    await expect(
      service.listCustomers({ page: 1, limit: 20 }),
    ).resolves.toEqual({
      data: [
        {
          id: 'user_1',
          name: 'User One',
          email: 'user@test.dev',
          phone: '+201000000001',
          active: true,
          createdAt,
          ordersCount: 3,
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  });

  it('returns 404 for staff IDs on the customer detail route', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ role: Role.MANAGER });

    await expect(service.getCustomer('manager_1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps customer order item counts and decimal totals in detail', async () => {
    const createdAt = new Date('2026-07-06T12:00:00.000Z');
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      name: 'User One',
      email: 'user@test.dev',
      phone: '+201000000001',
      active: true,
      role: Role.USER,
      createdAt,
      addresses: [],
      orders: [
        {
          id: 'order_1',
          humanOrderId: 'ORD-900001',
          status: 'PENDING',
          paymentMethod: 'CASH',
          totalOrderPrice: { toString: () => '2115.00' },
          isPaid: false,
          createdAt,
          _count: { items: 2 },
        },
      ],
    });

    await expect(service.getCustomer('user_1')).resolves.toMatchObject({
      id: 'user_1',
      orders: [{ totalOrderPrice: 2115, itemsCount: 2 }],
    });
  });

  it('rejects self activation changes before Clerk or DB writes', async () => {
    await expect(
      service.setActive('user_1', 'user_1', false),
    ).rejects.toMatchObject({
      response: { code: 'SELF_MODIFICATION_FORBIDDEN' },
    });
    expect(clerk.users.banUser).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects non-USER activation targets without calling Clerk', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'manager_1',
      role: Role.MANAGER,
      active: true,
    });

    await expect(
      service.setActive('admin_1', 'manager_1', false),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN_TARGET' },
    });
    expect(clerk.users.banUser).not.toHaveBeenCalled();
  });

  it('calls ban or unban before updating the DB', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user_1',
      role: Role.USER,
      active: true,
    });
    clerk.users.banUser.mockResolvedValueOnce({});
    prisma.user.update.mockResolvedValueOnce({ id: 'user_1', active: false });

    await expect(
      service.setActive('admin_1', 'user_1', false),
    ).resolves.toEqual({
      id: 'user_1',
      active: false,
    });
    expect(clerk.users.banUser).toHaveBeenCalledWith('user_1');

    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: false,
    });
    clerk.users.unbanUser.mockResolvedValueOnce({});
    prisma.user.update.mockResolvedValueOnce({ id: 'user_1', active: true });

    await service.setActive('admin_1', 'user_1', true);
    expect(clerk.users.unbanUser).toHaveBeenCalledWith('user_1');
  });

  it('does not update DB when Clerk activation fails', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
    });
    clerk.users.banUser.mockRejectedValueOnce(new Error('clerk down'));

    await expect(service.setActive('admin_1', 'user_1', false)).rejects.toThrow(
      'clerk down',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('reverts Clerk activation when the DB update fails', async () => {
    const dbError = new Error('db down');
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
    });
    clerk.users.banUser.mockResolvedValueOnce({});
    clerk.users.unbanUser.mockResolvedValueOnce({});
    prisma.user.update.mockRejectedValueOnce(dbError);

    await expect(service.setActive('admin_1', 'user_1', false)).rejects.toBe(
      dbError,
    );
    expect(clerk.users.unbanUser).toHaveBeenCalledWith('user_1');
  });

  it('logs CRITICAL when activation compensation fails', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user_1',
      role: Role.USER,
      active: true,
    });
    clerk.users.banUser.mockResolvedValueOnce({});
    clerk.users.unbanUser.mockRejectedValueOnce(new Error('revert failed'));
    prisma.user.update.mockRejectedValueOnce(new Error('db down'));

    await expect(service.setActive('admin_1', 'user_1', false)).rejects.toThrow(
      'db down',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'CRITICAL' }),
      'Admin identity compensation failed',
    );
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
