import amqp from 'amqplib';
import { MqNotificationProvider } from '../../../../../src/modules/notification/rabbitmq/rabbitmq.provider';
import { NOTIFICATION_QUEUE } from '../../../../../src/modules/notification/rabbitmq/rabbitmq.contract';

jest.mock('amqplib');

describe('rabbitmq.provider', () => {
  const sendToQueue = jest.fn();

  const mqChannel = {
    assertExchange: jest.fn().mockResolvedValue(undefined),
    assertQueue: jest.fn().mockResolvedValue(undefined),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    sendToQueue,
    on: jest.fn(),
  };

  const connection = {
    createChannel: jest.fn().mockResolvedValue(mqChannel),
    on: jest.fn(),
  };

  beforeEach(() => {
    (amqp.connect as jest.Mock).mockResolvedValue(connection);
  });

  it('publishes confirmation message with correct type and payload', async () => {
    const provider = new MqNotificationProvider('amqp://localhost');

    await provider.sendConfirmation(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    expect(sendToQueue).toHaveBeenCalledWith(
      NOTIFICATION_QUEUE,
      Buffer.from(
        JSON.stringify({
          type: 'confirmation',
          to: 'user@example.com',
          repo: 'owner/repo',
          confirmationUrl: 'https://app.example.com/confirm/token',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        }),
      ),
      {
        persistent: true,
        messageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    );
  });

  it('publishes release message with correct type and payload', async () => {
    const provider = new MqNotificationProvider('amqp://localhost');

    await provider.sendRelease(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );

    expect(sendToQueue).toHaveBeenCalledWith(
      NOTIFICATION_QUEUE,
      Buffer.from(
        JSON.stringify({
          type: 'release',
          to: 'user@example.com',
          repo: 'owner/repo',
          tag: 'v2.0.0',
          releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        }),
      ),
      {
        persistent: true,
        messageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    );
  });

  it('reuses the same channel across multiple publishes', async () => {
    const provider = new MqNotificationProvider('amqp://localhost');

    await provider.sendConfirmation(
      'a@example.com',
      'owner/repo',
      'https://app.example.com/confirm/a',
      'https://app.example.com/unsubscribe/a',
    );
    await provider.sendRelease(
      'b@example.com',
      'owner/repo',
      'v1.0.0',
      'https://github.com/owner/repo/releases/tag/v1.0.0',
      'https://app.example.com/unsubscribe/b',
    );

    expect(amqp.connect).toHaveBeenCalledTimes(1);
    expect(connection.createChannel).toHaveBeenCalledTimes(1);
    expect(sendToQueue).toHaveBeenCalledTimes(2);
  });
});
