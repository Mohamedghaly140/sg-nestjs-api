import { createHmac, randomUUID } from 'node:crypto';
import { ClerkTokenVerifierService } from '../../src/modules/auth/services/clerk-token-verifier.service';

export const TEST_TOKENS = {
  admin: 'test-token-admin',
  manager: 'test-token-manager',
  customer: 'test-token-customer',
} as const;

const SUBJECT_BY_TOKEN: Record<string, string> = {
  [TEST_TOKENS.admin]: 'user_seed_admin',
  [TEST_TOKENS.manager]: 'user_seed_manager',
  [TEST_TOKENS.customer]: 'user_seed_customer',
};

export class FakeClerkTokenVerifierService implements Pick<
  ClerkTokenVerifierService,
  'verify'
> {
  verify(token: string): Promise<{ sub: string }> {
    const sub = SUBJECT_BY_TOKEN[token];
    if (!sub) throw new Error('Invalid test token');
    return Promise.resolve({ sub });
  }
}

export function createFakeClerkClient() {
  return {
    users: {
      getUser: jest.fn(),
      updateUser: jest.fn().mockResolvedValue({}),
      updateUserMetadata: jest.fn().mockResolvedValue({}),
    },
    phoneNumbers: {
      createPhoneNumber: jest.fn().mockResolvedValue({ id: 'phone_new' }),
      deletePhoneNumber: jest.fn().mockResolvedValue({}),
    },
  };
}

export function signClerkPayload(payload: string): Record<string, string> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_')) {
    throw new Error(
      'CLERK_WEBHOOK_SECRET must be a whsec_ value for e2e tests',
    );
  }

  const id = `msg_${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signature = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  return {
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  };
}

export function authHeader(token: string): {
  Authorization: string;
} {
  return { Authorization: `Bearer ${token}` };
}
