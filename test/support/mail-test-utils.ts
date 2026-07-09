import type { CreateEmailOptions } from 'resend';
import type { ResendClient } from '../../src/modules/mail/resend-client.provider';

export type CapturedEmail = CreateEmailOptions;

export function createCapturingResendClient() {
  const sent: CapturedEmail[] = [];
  let shouldFail = false;
  const send = jest.fn((payload: CreateEmailOptions) => {
    if (shouldFail) {
      return Promise.reject(new Error('forced mail failure'));
    }
    sent.push(payload);
    return Promise.resolve({
      data: { id: `email_${sent.length}` },
      error: null,
    });
  });

  return {
    client: { emails: { send } } as unknown as ResendClient,
    sent,
    send,
    fail() {
      shouldFail = true;
    },
    reset() {
      sent.length = 0;
      shouldFail = false;
      send.mockClear();
    },
  };
}
