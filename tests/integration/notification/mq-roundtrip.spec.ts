import amqp from 'amqplib';
import { MqNotificationProvider } from '../../../src/modules/notification/rabbitmq/rabbitmq.provider';
import { startMqConsumer } from '../../../src/modules/notification/rabbitmq/rabbitmq.consumer';
import { NOTIFICATION_QUEUE } from '../../../src/modules/notification/rabbitmq/rabbitmq.contract';
import type { NotificationChannel } from '../../../src/modules/notification/delivery/notification-channel.interface';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost:5673';

const waitFor = (
  fn: () => boolean,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const id = setInterval(() => {
      if (fn()) {
        clearInterval(id);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(id);
        reject(new Error('Timed out waiting for condition'));
      }
    }, intervalMs);
  });

describe('notification MQ round-trip', () => {
  let connection: amqp.ChannelModel;
  let adminChannel: amqp.Channel;

  const channel: jest.Mocked<NotificationChannel> = {
    sendConfirmation: jest.fn().mockResolvedValue(undefined),
    sendRelease: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    connection = await amqp.connect(RABBITMQ_URL);
    adminChannel = await connection.createChannel();
    await adminChannel.assertQueue(NOTIFICATION_QUEUE, { durable: true });

    await startMqConsumer(RABBITMQ_URL, channel);
  });

  beforeEach(async () => {
    await adminChannel.purgeQueue(NOTIFICATION_QUEUE);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await adminChannel.deleteQueue(NOTIFICATION_QUEUE);
    await connection.close();
  });

  it('consumer receives and processes confirmation message published by provider', async () => {
    const provider = new MqNotificationProvider(RABBITMQ_URL);

    await provider.sendConfirmation(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    await waitFor(() => channel.sendConfirmation.mock.calls.length > 0);

    expect(channel.sendConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );
    expect(channel.sendRelease).not.toHaveBeenCalled();
  });

  it('consumer receives and processes release message published by provider', async () => {
    const provider = new MqNotificationProvider(RABBITMQ_URL);

    await provider.sendRelease(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );

    await waitFor(() => channel.sendRelease.mock.calls.length > 0);

    expect(channel.sendRelease).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );
    expect(channel.sendConfirmation).not.toHaveBeenCalled();
  });
});
