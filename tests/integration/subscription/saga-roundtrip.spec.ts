import amqp from 'amqplib';
import { SubscriptionSagaOrchestrator } from '../../../src/modules/subscription/saga/subscription-saga.orchestrator';
import { startSubscriptionSagaConsumer } from '../../../src/modules/subscription/saga/subscription-saga.consumer';
import { startSubscriptionSagaCommandConsumer } from '../../../src/modules/notification/saga/subscription-saga.consumer';
import {
  SEND_CONFIRMATION_COMMAND_QUEUE,
  SUBSCRIPTION_SAGA_EVENTS_QUEUE,
  type SubscriptionSagaEvent,
} from '../../../src/modules/subscription/saga/subscription-saga.contract';
import type { NotificationChannel } from '../../../src/modules/notification/delivery/notification-channel.interface';
import type { SubscriptionRepositoryInterface } from '../../../src/modules/subscription/interfaces/subscription-repository.interface';

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

describe('subscription saga MQ round-trip', () => {
  let connection: amqp.ChannelModel;
  let adminChannel: amqp.Channel;

  const channel: jest.Mocked<NotificationChannel> = {
    sendConfirmation: jest.fn().mockResolvedValue(undefined),
    sendRelease: jest.fn().mockResolvedValue(undefined),
  };

  const subscriptionRepository: jest.Mocked<SubscriptionRepositoryInterface> = {
    createSubscription: jest.fn(),
    findByConfirmationToken: jest.fn(),
    confirmByToken: jest.fn(),
    deleteByUnsubscribeToken: jest.fn(),
    deleteById: jest.fn(),
    findByEmail: jest.fn(),
  } as unknown as jest.Mocked<SubscriptionRepositoryInterface>;

  beforeAll(async () => {
    connection = await amqp.connect(RABBITMQ_URL);
    adminChannel = await connection.createChannel();
    await adminChannel.assertQueue(SEND_CONFIRMATION_COMMAND_QUEUE, {
      durable: true,
    });
    await adminChannel.assertQueue(SUBSCRIPTION_SAGA_EVENTS_QUEUE, {
      durable: true,
    });

    await startSubscriptionSagaCommandConsumer(RABBITMQ_URL, channel);

    const orchestrator = new SubscriptionSagaOrchestrator(
      RABBITMQ_URL,
      subscriptionRepository,
    );
    await startSubscriptionSagaConsumer(RABBITMQ_URL, orchestrator);
  });

  beforeEach(async () => {
    await adminChannel.purgeQueue(SEND_CONFIRMATION_COMMAND_QUEUE);
    await adminChannel.purgeQueue(SUBSCRIPTION_SAGA_EVENTS_QUEUE);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await adminChannel.deleteQueue(SEND_CONFIRMATION_COMMAND_QUEUE);
    await adminChannel.deleteQueue(SUBSCRIPTION_SAGA_EVENTS_QUEUE);
    await connection.close();
  });

  it('sends the confirmation email and completes the saga on success', async () => {
    const orchestrator = new SubscriptionSagaOrchestrator(
      RABBITMQ_URL,
      subscriptionRepository,
    );

    await orchestrator.start({
      subscriptionId: 'sub-success',
      email: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });

    await waitFor(() => channel.sendConfirmation.mock.calls.length > 0);

    expect(channel.sendConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(subscriptionRepository.deleteById).not.toHaveBeenCalled();
  });

  it('compensates by deleting the subscription when the confirmation email fails permanently', async () => {
    channel.sendConfirmation
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockRejectedValueOnce(new Error('SMTP down'));

    const orchestrator = new SubscriptionSagaOrchestrator(
      RABBITMQ_URL,
      subscriptionRepository,
    );

    await orchestrator.start({
      subscriptionId: 'sub-failure',
      email: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });

    await waitFor(
      () => subscriptionRepository.deleteById.mock.calls.length > 0,
      10_000,
    );

    expect(subscriptionRepository.deleteById).toHaveBeenCalledWith(
      'sub-failure',
    );
  });

  it('delivers a directly-published failure event to the orchestrator for compensation', async () => {
    const event: SubscriptionSagaEvent = {
      type: 'confirmation-email-failed',
      subscriptionId: 'sub-direct-event',
      reason: 'manual test',
    };

    adminChannel.sendToQueue(
      SUBSCRIPTION_SAGA_EVENTS_QUEUE,
      Buffer.from(JSON.stringify(event)),
      { persistent: true },
    );

    await waitFor(
      () => subscriptionRepository.deleteById.mock.calls.length > 0,
    );

    expect(subscriptionRepository.deleteById).toHaveBeenCalledWith(
      'sub-direct-event',
    );
  });
});
