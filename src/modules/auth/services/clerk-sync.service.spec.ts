import type { UserJSON } from '@clerk/backend';
import { Role } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ClerkSyncService } from './clerk-sync.service';

function webhookUser(overrides: Partial<UserJSON> = {}): UserJSON {
  return {
    id: 'user_1',
    first_name: 'Mariam',
    last_name: 'Hassan',
    primary_email_address_id: 'email_1',
    primary_phone_number_id: null,
    email_addresses: [{ id: 'email_1', email_address: 'mariam@test.dev' }],
    phone_numbers: [],
    ...overrides,
  };
}

describe('ClerkSyncService', () => {
  const prisma = {
    user: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const clerk = {
    users: {
      getUser: jest.fn(),
      updateUserMetadata: jest.fn(),
      updateUser: jest.fn(),
    },
    phoneNumbers: {
      createPhoneNumber: jest.fn(),
      deletePhoneNumber: jest.fn(),
    },
  };
  const logger = {
    error: jest.fn(),
    warn: jest.fn(),
  };
  const service = new ClerkSyncService(
    prisma as unknown as PrismaService,
    clerk,
    logger as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.upsert.mockResolvedValue({});
    prisma.user.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('creates with Prisma defaults and a missing-phone sentinel', async () => {
    await service.upsertFromWebhookUser(webhookUser());
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      update: {
        email: 'mariam@test.dev',
        name: 'Mariam Hassan',
        phone: 'pending:user_1',
      },
      create: {
        id: 'user_1',
        email: 'mariam@test.dev',
        name: 'Mariam Hassan',
        phone: 'pending:user_1',
      },
    });
  });

  it('never writes webhook role or active fields', async () => {
    await service.upsertFromWebhookUser(
      webhookUser({
        public_metadata: { role: Role.ADMIN, active: false },
      }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      update: {
        email: 'mariam@test.dev',
        name: 'Mariam Hassan',
        phone: 'pending:user_1',
      },
      create: {
        id: 'user_1',
        email: 'mariam@test.dev',
        name: 'Mariam Hassan',
        phone: 'pending:user_1',
      },
    });
  });

  it('makes deletion of an unknown id a no-op', async () => {
    await expect(
      service.deleteFromWebhookUser({ id: 'missing' }),
    ).resolves.toBeUndefined();
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'missing' },
    });
  });

  it('mirrors roles with updateUserMetadata, not updateUser', async () => {
    clerk.users.updateUserMetadata.mockResolvedValue({});
    await service.mirrorRoleToClerk('user_1', Role.ADMIN);
    expect(clerk.users.updateUserMetadata).toHaveBeenCalledWith('user_1', {
      publicMetadata: { role: Role.ADMIN },
    });
    expect(clerk.users.updateUser).not.toHaveBeenCalled();
  });
});
