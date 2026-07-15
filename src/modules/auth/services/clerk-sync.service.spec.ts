/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { UserJSON } from '@clerk/backend';
import { Prisma, Role } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ClerkClient } from '../clerk-client.provider';
import { ClerkSyncService } from './clerk-sync.service';

function webhookUser(overrides: Partial<UserJSON> = {}): UserJSON {
  const user: UserJSON = {
    object: 'user',
    id: 'user_1',
    username: null,
    first_name: 'Mariam',
    last_name: 'Hassan',
    image_url: 'https://img.clerk.test/user_1',
    has_image: false,
    primary_email_address_id: 'email_1',
    primary_phone_number_id: null,
    primary_web3_wallet_id: null,
    password_enabled: true,
    two_factor_enabled: false,
    totp_enabled: false,
    backup_code_enabled: false,
    email_addresses: [
      {
        object: 'email_address',
        id: 'email_1',
        email_address: 'mariam@test.dev',
        verification: null,
        linked_to: [],
      },
    ],
    phone_numbers: [],
    web3_wallets: [],
    organization_memberships: null,
    external_accounts: [],
    enterprise_accounts: [],
    password_last_updated_at: null,
    public_metadata: {},
    private_metadata: {},
    unsafe_metadata: {},
    external_id: null,
    last_sign_in_at: null,
    banned: false,
    locked: false,
    lockout_expires_in_seconds: null,
    verification_attempts_remaining: null,
    created_at: 1,
    updated_at: 1,
    last_active_at: null,
    create_organization_enabled: true,
    create_organizations_limit: null,
    delete_self_enabled: true,
    legal_accepted_at: null,
    locale: null,
  };

  return {
    ...user,
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
    clerk as unknown as ClerkClient,
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
      service.deleteFromWebhookUser({
        object: 'user',
        id: 'missing',
        deleted: true,
      }),
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

  it('uses the primary phone number from the webhook payload when present', async () => {
    await service.upsertFromWebhookUser(
      webhookUser({
        primary_phone_number_id: 'phone_1',
        phone_numbers: [
          { id: 'phone_1', phone_number: '+201000000001' },
        ] as never,
      }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ phone: '+201000000001' }),
      }),
    );
  });

  it('falls back to the email when the webhook user has no name', async () => {
    await service.upsertFromWebhookUser(
      webhookUser({ first_name: null, last_name: null }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ name: 'mariam@test.dev' }),
      }),
    );
  });

  it('rejects webhook users without a primary email', async () => {
    await expect(
      service.upsertFromWebhookUser(
        webhookUser({ primary_email_address_id: null, email_addresses: [] }),
      ),
    ).rejects.toThrow('has no primary email');
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('swallows unique-constraint collisions with an audit log entry', async () => {
    prisma.user.upsert.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('collision', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.upsertFromWebhookUser(webhookUser()),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'clerk-user-sync-collision' }),
      expect.any(String),
    );
  });

  it('rethrows non-P2002 errors from the sync upsert', async () => {
    prisma.user.upsert.mockRejectedValueOnce(new Error('db down'));

    await expect(service.upsertFromWebhookUser(webhookUser())).rejects.toThrow(
      'db down',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('skips deletion when the webhook payload has no id', async () => {
    await service.deleteFromWebhookUser({ object: 'user', deleted: true });
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it('syncs a user from the Clerk API using primary email and phone', async () => {
    clerk.users.getUser.mockResolvedValueOnce({
      id: 'user_1',
      firstName: 'Mariam',
      lastName: 'Hassan',
      primaryEmailAddressId: 'email_1',
      primaryPhoneNumberId: 'phone_1',
      emailAddresses: [{ id: 'email_1', emailAddress: 'mariam@test.dev' }],
      phoneNumbers: [{ id: 'phone_1', phoneNumber: '+201000000001' }],
    });

    await service.syncFromClerk('user_1');

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          id: 'user_1',
          email: 'mariam@test.dev',
          name: 'Mariam Hassan',
          phone: '+201000000001',
        },
      }),
    );
  });

  it('rejects Clerk API users without a primary email', async () => {
    clerk.users.getUser.mockResolvedValueOnce({
      id: 'user_1',
      firstName: null,
      lastName: null,
      primaryEmailAddressId: null,
      primaryPhoneNumberId: null,
      emailAddresses: [],
      phoneNumbers: [],
    });

    await expect(service.syncFromClerk('user_1')).rejects.toThrow(
      'has no primary email',
    );
  });

  it('only warns when role mirroring to Clerk fails', async () => {
    clerk.users.updateUserMetadata.mockRejectedValueOnce(
      new Error('clerk down'),
    );

    await expect(
      service.mirrorRoleToClerk('user_1', Role.MANAGER),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('pushes an explicit name pair to Clerk without redistributing tokens', async () => {
    clerk.users.updateUser.mockResolvedValueOnce({});

    await service.pushProfileToClerk('user_1', {
      firstName: 'Mary Anne',
      lastName: 'Smith Hassan',
    });

    expect(clerk.users.updateUser).toHaveBeenCalledWith('user_1', {
      firstName: 'Mary Anne',
      lastName: 'Smith Hassan',
    });
    expect(clerk.users.getUser).not.toHaveBeenCalled();
  });

  it('warns and skips Clerk writes for an internally mismatched name pair', async () => {
    await service.pushProfileToClerk('user_1', {
      firstName: 'Mariam',
    } as never);

    expect(clerk.users.updateUser).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('replaces the Clerk phone number, deleting superseded ones', async () => {
    clerk.users.getUser.mockResolvedValueOnce({
      phoneNumbers: [{ id: 'phone_old' }],
    });
    clerk.phoneNumbers.createPhoneNumber.mockResolvedValueOnce({
      id: 'phone_new',
    });
    clerk.phoneNumbers.deletePhoneNumber.mockResolvedValueOnce({});

    await service.pushProfileToClerk('user_1', { phone: '01000000001' });

    expect(clerk.phoneNumbers.createPhoneNumber).toHaveBeenCalledWith({
      userId: 'user_1',
      phoneNumber: '+201000000001',
      primary: true,
      verified: true,
    });
    expect(clerk.phoneNumbers.deletePhoneNumber).toHaveBeenCalledWith(
      'phone_old',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('only warns when the pushed phone number is not a valid Egyptian number', async () => {
    await expect(
      service.pushProfileToClerk('user_1', { phone: 'not-a-phone' }),
    ).resolves.toBeUndefined();
    expect(clerk.phoneNumbers.createPhoneNumber).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('sets a random password and signs out other sessions', async () => {
    clerk.users.updateUser.mockResolvedValueOnce({});

    await service.setRandomPassword('user_1', 's3cret-password');

    expect(clerk.users.updateUser).toHaveBeenCalledWith('user_1', {
      password: 's3cret-password',
      signOutOfOtherSessions: true,
    });
  });
});
