import { ConfigService } from '@nestjs/config';
import type { ClerkSyncService } from '../services/clerk-sync.service';
import { ClerkWebhookController } from './clerk-webhook.controller';

jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({
    verify: jest.fn(),
  })),
}));

import { Webhook } from 'svix';

describe('ClerkWebhookController', () => {
  const sync = {
    upsertFromWebhookUser: jest.fn(),
    deleteFromWebhookUser: jest.fn(),
  };
  const controller = new ClerkWebhookController(
    {
      getOrThrow: jest.fn().mockReturnValue('whsec_test'),
    } as unknown as ConfigService,
    sync as unknown as ClerkSyncService,
  );

  beforeEach(() => jest.clearAllMocks());

  function request() {
    return { rawBody: Buffer.from('{}') } as never;
  }

  it('rejects an invalid signature', async () => {
    jest.mocked(Webhook).mockImplementationOnce(
      () =>
        ({
          verify: () => {
            throw new Error('bad');
          },
        }) as unknown as Webhook,
    );
    await expect(
      controller.handle(request(), 'id', 'timestamp', 'signature'),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_WEBHOOK_SIGNATURE' },
    });
  });

  it.each(['user.created', 'user.updated'] as const)(
    'dispatches %s to upsert',
    async (type) => {
      jest.mocked(Webhook).mockImplementationOnce(
        () =>
          ({
            verify: () => ({ type, data: { id: 'user_1' } }),
          }) as unknown as Webhook,
      );
      await expect(
        controller.handle(request(), 'id', 'timestamp', 'signature'),
      ).resolves.toEqual({ received: true });
      expect(sync.upsertFromWebhookUser).toHaveBeenCalled();
    },
  );

  it('dispatches deletion and acknowledges unknown events', async () => {
    jest
      .mocked(Webhook)
      .mockImplementationOnce(
        () =>
          ({
            verify: () => ({
              type: 'user.deleted',
              data: { id: 'user_1' },
            }),
          }) as unknown as Webhook,
      )
      .mockImplementationOnce(
        () =>
          ({
            verify: () => ({ type: 'session.created', data: {} }),
          }) as unknown as Webhook,
      );

    await controller.handle(request(), 'id', 'timestamp', 'signature');
    expect(sync.deleteFromWebhookUser).toHaveBeenCalled();
    await expect(
      controller.handle(request(), 'id', 'timestamp', 'signature'),
    ).resolves.toEqual({ received: true });
  });
});
