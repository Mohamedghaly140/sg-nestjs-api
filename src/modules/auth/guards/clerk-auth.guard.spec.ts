import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ClerkSyncService } from '../services/clerk-sync.service';
import type { ClerkTokenVerifierService } from '../services/clerk-token-verifier.service';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';

const activeUser = {
  id: 'user_1',
  email: 'one@test.dev',
  name: 'One',
  phone: '+201000000001',
  role: Role.USER,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function context(authorization?: string): {
  execution: ExecutionContext;
  request: { headers: { authorization?: string }; user?: unknown };
} {
  const request = { headers: { authorization } };
  return {
    request,
    execution: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext,
  };
}

describe('ClerkAuthGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;
  const verifier = { verify: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const sync = { syncFromClerk: jest.fn() };
  const guard = new ClerkAuthGuard(
    reflector,
    verifier as unknown as ClerkTokenVerifierService,
    prisma as unknown as PrismaService,
    sync as unknown as ClerkSyncService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects a missing bearer token', async () => {
    await expect(guard.canActivate(context().execution)).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('collapses token verification failures to UNAUTHENTICATED', async () => {
    verifier.verify.mockRejectedValueOnce(new Error('bad token'));
    await expect(
      guard.canActivate(context('Bearer bad').execution),
    ).rejects.toMatchObject({
      response: { code: 'UNAUTHENTICATED' },
    });
  });

  it('JIT-syncs a missing local user', async () => {
    verifier.verify.mockResolvedValueOnce({ sub: activeUser.id });
    prisma.user.findUnique.mockResolvedValueOnce(null);
    sync.syncFromClerk.mockResolvedValueOnce(activeUser);
    const request = context('Bearer valid');

    await expect(guard.canActivate(request.execution)).resolves.toBe(true);
    expect(sync.syncFromClerk).toHaveBeenCalledWith(activeUser.id);
    expect(request.request.user).toMatchObject({ id: activeUser.id });
  });

  it('rejects an inactive account', async () => {
    verifier.verify.mockResolvedValueOnce({ sub: activeUser.id });
    prisma.user.findUnique.mockResolvedValueOnce({
      ...activeUser,
      active: false,
    });
    await expect(
      guard.canActivate(context('Bearer valid').execution),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
  });
});

describe('OptionalAuthGuard', () => {
  const reflector = {} as Reflector;
  const verifier = { verify: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  const sync = { syncFromClerk: jest.fn() };
  const guard = new OptionalAuthGuard(
    reflector,
    verifier as unknown as ClerkTokenVerifierService,
    prisma as unknown as PrismaService,
    sync as unknown as ClerkSyncService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('allows missing and invalid credentials anonymously', async () => {
    await expect(guard.canActivate(context().execution)).resolves.toBe(true);
    verifier.verify.mockRejectedValueOnce(new Error('bad token'));
    await expect(
      guard.canActivate(context('Bearer bad').execution),
    ).resolves.toBe(true);
  });

  it('still rejects a verified inactive account', async () => {
    verifier.verify.mockResolvedValueOnce({ sub: activeUser.id });
    prisma.user.findUnique.mockResolvedValueOnce({
      ...activeUser,
      active: false,
    });
    await expect(
      guard.canActivate(context('Bearer valid').execution),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
  });
});
