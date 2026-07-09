import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { MailService, type SendEmailInput } from './mail.service';
import type { ResendClient } from './resend-client.provider';

describe('MailService', () => {
  const input: SendEmailInput = {
    to: 'customer@test.dev',
    subject: 'Subject',
    html: '<p>Hello</p>',
    text: 'Hello',
    context: {
      event: 'order.created',
      orderId: 'order_1',
      humanOrderId: 'ORD-000001',
    },
  };
  const send = jest.fn();
  const resend = {
    emails: { send },
  } as unknown as ResendClient;
  const config = {
    get: jest.fn(),
  };
  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    config.get.mockReturnValue('SG Couture <orders@test.dev>');
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });
  });

  it('sends an email with configured sender', async () => {
    const service = new MailService(
      resend,
      config as unknown as ConfigService,
      logger as unknown as Logger,
    );

    await expect(service.sendEmail(input)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledWith({
      from: 'SG Couture <orders@test.dev>',
      to: 'customer@test.dev',
      subject: 'Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
  });

  it('retries transient failures and then succeeds', async () => {
    jest.useFakeTimers();
    send
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: { id: 'email_2' }, error: null });
    const service = new MailService(
      resend,
      config as unknown as ConfigService,
      logger as unknown as Logger,
    );

    const promise = service.sendEmail(input);
    await jest.advanceTimersByTimeAsync(100);
    await promise;

    expect(send).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order_1', attempt: 1 }),
      'Email delivery failed; retrying',
    );
  });

  it('logs and resolves after retry exhaustion', async () => {
    jest.useFakeTimers();
    send.mockRejectedValue(new Error('down'));
    const service = new MailService(
      resend,
      config as unknown as ConfigService,
      logger as unknown as Logger,
    );

    const promise = service.sendEmail(input);
    await jest.advanceTimersByTimeAsync(300);

    await expect(promise).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: true,
        orderId: 'order_1',
        attempts: 3,
      }),
      'Email delivery failed after retries',
    );
  });

  it('no-ops when the client is unconfigured', async () => {
    const service = new MailService(
      null,
      config as unknown as ConfigService,
      logger as unknown as Logger,
    );

    await expect(service.sendEmail(input)).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order_1' }),
      'Mail is not configured; skipping email',
    );
  });
});
