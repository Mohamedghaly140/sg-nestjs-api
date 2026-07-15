import type { PrismaService } from '../../prisma/prisma.service';
import type { ClerkSyncService } from '../auth/services/clerk-sync.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const clerkSync = {
    pushProfileToClerk: jest.fn(),
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    clerkSync as unknown as ClerkSyncService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the current user profile', async () => {
    const user = {
      id: 'user_1',
      email: 'user@test.dev',
      name: 'User One',
      phone: '+201000000001',
      role: 'USER',
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
    };
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce(user);

    await expect(service.getMe('user_1')).resolves.toBe(user);
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
  });

  it('composes an explicit name pair without writing DTO-only fields to Prisma', async () => {
    const dto = {
      firstName: 'Mary Anne',
      lastName: 'Updated',
      phone: '+201000000003',
    };
    const user = {
      id: 'user_1',
      email: 'user@test.dev',
      name: 'Mary Anne Updated',
      phone: '+201000000003',
      role: 'USER',
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
    };
    prisma.user.update.mockResolvedValueOnce(user);
    clerkSync.pushProfileToClerk.mockResolvedValueOnce(undefined);

    await expect(service.updateMe('user_1', dto)).resolves.toBe(user);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: {
        name: 'Mary Anne Updated',
        phone: '+201000000003',
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });
    expect(clerkSync.pushProfileToClerk).toHaveBeenCalledWith('user_1', dto);
  });

  it('updates a phone without changing or pushing name fields', async () => {
    const dto = { phone: '+201000000003' };
    const user = {
      id: 'user_1',
      email: 'user@test.dev',
      name: 'User One',
      phone: '+201000000003',
      role: 'USER',
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
    };
    prisma.user.update.mockResolvedValueOnce(user);
    clerkSync.pushProfileToClerk.mockResolvedValueOnce(undefined);

    await expect(service.updateMe('user_1', dto)).resolves.toBe(user);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { phone: '+201000000003' } }),
    );
    expect(clerkSync.pushProfileToClerk).toHaveBeenCalledWith('user_1', dto);
  });
});
