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

  it('updates the local profile before pushing the profile to Clerk', async () => {
    const dto = { name: 'User Updated' };
    const user = {
      id: 'user_1',
      email: 'user@test.dev',
      name: 'User Updated',
      phone: '+201000000001',
      role: 'USER',
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
    };
    prisma.user.update.mockResolvedValueOnce(user);
    clerkSync.pushProfileToClerk.mockResolvedValueOnce(undefined);

    await expect(service.updateMe('user_1', dto)).resolves.toBe(user);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: dto,
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
});
