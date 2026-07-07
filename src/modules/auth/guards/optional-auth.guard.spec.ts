import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ClerkSyncService } from '../services/clerk-sync.service';
import type { ClerkTokenVerifierService } from '../services/clerk-token-verifier.service';
import { OptionalAuthGuard } from './optional-auth.guard';

function context(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as unknown as ExecutionContext;
}

describe('OptionalAuthGuard', () => {
  const verifier = { verify: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const guard = new OptionalAuthGuard(
    {} as Reflector,
    verifier as unknown as ClerkTokenVerifierService,
    prisma as unknown as PrismaService,
    { syncFromClerk: jest.fn() } as unknown as ClerkSyncService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('allows missing and invalid credentials anonymously', async () => {
    await expect(guard.canActivate(context())).resolves.toBe(true);
    verifier.verify.mockRejectedValueOnce(new Error('bad token'));
    await expect(guard.canActivate(context('Bearer invalid'))).resolves.toBe(
      true,
    );
  });

  it('rejects a verified but deactivated identity', async () => {
    verifier.verify.mockResolvedValueOnce({ sub: 'user_1' });
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user_1',
      email: 'user@test.dev',
      name: 'User',
      phone: '+201000000001',
      role: Role.USER,
      active: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      guard.canActivate(context('Bearer valid')),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
  });
});
