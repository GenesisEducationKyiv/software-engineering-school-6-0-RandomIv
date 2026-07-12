import amqp from 'amqplib';
import { MqNotificationProvider } from '../../../src/modules/notification/rabbitmq/rabbitmq.provider';
import { startMqConsumer } from '../../../src/modules/notification/rabbitmq/rabbitmq.consumer';
import {
  NOTIFICATION_DLQ,
  NOTIFICATION_QUEUE,
  setupNotificationTopology,
} from '../../../src/modules/notification/rabbitmq/rabbitmq.contract';
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

const waitForAsync = async (
  fn: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Timed out waiting for condition');
};

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
    await setupNotificationTopology(adminChannel);

    await startMqConsumer(RABBITMQ_URL, channel);
  });

  beforeEach(async () => {
    await adminChannel.purgeQueue(NOTIFICATION_QUEUE);
    await adminChannel.purgeQueue(NOTIFICATION_DLQ);
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

  it('dead-letters a message that fails validation into the DLQ', async () => {
    adminChannel.sendToQueue(
      NOTIFICATION_QUEUE,
      Buffer.from(JSON.stringify({ type: 'unknown' })),
      { persistent: true },
    );

    await waitForAsync(
      async () =>
        (await adminChannel.checkQueue(NOTIFICATION_DLQ)).messageCount > 0,
    );

    const { messageCount } = await adminChannel.checkQueue(NOTIFICATION_DLQ);
    expect(messageCount).toBeGreaterThan(0);
    expect(channel.sendConfirmation).not.toHaveBeenCalled();
    expect(channel.sendRelease).not.toHaveBeenCalled();
  });
});
