import amqp from 'amqplib';
import { startMqConsumer } from '../../../../src/modules/notification/rabbitmq/rabbitmq.consumer';
import { NOTIFICATION_QUEUE } from '../../../../src/modules/notification/rabbitmq/rabbitmq.contract';
import type { NotificationChannel } from '../../../../src/modules/notification/delivery/notification-channel.interface';
import type { NotificationMessage } from '../../../../src/modules/notification/rabbitmq/rabbitmq.contract';

jest.mock('amqplib');

const makeMessage = (
  payload: NotificationMessage,
  redelivered = false,
): amqp.ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(payload)),
    fields: { redelivered },
    properties: {},
  }) as unknown as amqp.ConsumeMessage;

describe('rabbitmq.consumer', () => {
  const ack = jest.fn();
  const nack = jest.fn();
  const consume = jest.fn();

  const mqChannel = {
    assertQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn(),
    consume,
    ack,
    nack,
  };

  const model = {
    createChannel: jest.fn().mockResolvedValue(mqChannel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };

  const channel: jest.Mocked<NotificationChannel> = {
    sendConfirmation: jest.fn().mockResolvedValue(undefined),
    sendRelease: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    (amqp.connect as jest.Mock).mockResolvedValue(model);
  });

  const setup = async () => {
    await startMqConsumer('amqp://localhost', channel);
    const handler: (msg: amqp.ConsumeMessage | null) => Promise<void> =
      consume.mock.calls[0][1];
    return handler;
  };

  it('asserts durable queue and sets prefetch on startup', async () => {
    await startMqConsumer('amqp://localhost', channel);

    expect(mqChannel.assertQueue).toHaveBeenCalledWith(NOTIFICATION_QUEUE, {
      durable: true,
    });
    expect(mqChannel.prefetch).toHaveBeenCalledWith(1);
  });

  it('routes confirmation message to sendConfirmation and acks', async () => {
    const handler = await setup();
    const payload: NotificationMessage = {
      type: 'confirmation',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    await handler(makeMessage(payload));

    expect(channel.sendConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );
    expect(channel.sendRelease).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('routes release message to sendRelease and acks', async () => {
    const handler = await setup();
    const payload: NotificationMessage = {
      type: 'release',
      to: 'user@example.com',
      repo: 'owner/repo',
      tag: 'v2.0.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    await handler(makeMessage(payload));

    expect(channel.sendRelease).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );
    expect(channel.sendConfirmation).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks with requeue on first delivery failure', async () => {
    channel.sendConfirmation.mockRejectedValueOnce(new Error('SMTP error'));
    const handler = await setup();
    const payload: NotificationMessage = {
      type: 'confirmation',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    await handler(makeMessage(payload, false));

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('nacks without requeue when message was already redelivered', async () => {
    channel.sendConfirmation.mockRejectedValueOnce(new Error('SMTP error'));
    const handler = await setup();
    const payload: NotificationMessage = {
      type: 'confirmation',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    await handler(makeMessage(payload, true));

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('ignores null message', async () => {
    const handler = await setup();

    await handler(null);

    expect(channel.sendConfirmation).not.toHaveBeenCalled();
    expect(channel.sendRelease).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });
});
