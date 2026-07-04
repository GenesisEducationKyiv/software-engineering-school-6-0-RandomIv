import amqp from 'amqplib';
import { RabbitConsumer } from '../../../src/core/rabbitmq/rabbit-consumer';
import { RabbitMessagePublisher } from '../../../src/core/rabbitmq/rabbit-publisher';
import { SagaConfirmationProvider } from '../../../src/modules/notification/rabbitmq/saga/saga.provider';
import { SendConfirmationCommandHandler } from '../../../src/modules/notification/rabbitmq/saga/saga.handler';
import { SubscriptionSagaOrchestrator } from '../../../src/modules/subscription/saga/subscription-saga.orchestrator';
import {
  SEND_CONFIRMATION_COMMAND_QUEUE,
  SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE,
  type SendConfirmationCommand,
  type SubscriptionNotificationEvent,
} from '../../../src/modules/notification/rabbitmq/saga/saga.contract';
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
  let commandConsumerModel: amqp.RecoveringChannelModel;
  let eventConsumerModel: amqp.RecoveringChannelModel;
  let provider: SagaConfirmationProvider;

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
    await adminChannel.assertQueue(SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE, {
      durable: true,
    });

    const eventPublisher =
      new RabbitMessagePublisher<SubscriptionNotificationEvent>(
        RABBITMQ_URL,
        SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE,
      );
    const commandConsumer = new RabbitConsumer<SendConfirmationCommand>(
      RABBITMQ_URL,
      SEND_CONFIRMATION_COMMAND_QUEUE,
      new SendConfirmationCommandHandler(channel, eventPublisher),
    );
    commandConsumerModel = await commandConsumer.start();

    const orchestrator = new SubscriptionSagaOrchestrator(
      subscriptionRepository,
    );
    const eventConsumer = new RabbitConsumer<SubscriptionNotificationEvent>(
      RABBITMQ_URL,
      SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE,
      orchestrator,
    );
    eventConsumerModel = await eventConsumer.start();

    const commandPublisher =
      new RabbitMessagePublisher<SendConfirmationCommand>(
        RABBITMQ_URL,
        SEND_CONFIRMATION_COMMAND_QUEUE,
      );
    provider = new SagaConfirmationProvider(commandPublisher);
  });

  beforeEach(async () => {
    await adminChannel.purgeQueue(SEND_CONFIRMATION_COMMAND_QUEUE);
    await adminChannel.purgeQueue(SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await adminChannel.deleteQueue(SEND_CONFIRMATION_COMMAND_QUEUE);
    await adminChannel.deleteQueue(SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE);
    await connection.close();
    await commandConsumerModel.close();
    await eventConsumerModel.close();
  });

  it('sends the confirmation and completes the saga on success', async () => {
    await provider.sendConfirmation(
      'sub-success',
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

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(subscriptionRepository.deleteById).not.toHaveBeenCalled();
  });

  it('compensates by deleting the subscription when the confirmation fails permanently', async () => {
    channel.sendConfirmation
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockRejectedValueOnce(new Error('SMTP down'));

    await provider.sendConfirmation(
      'sub-failure',
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    await waitFor(
      () => subscriptionRepository.deleteById.mock.calls.length > 0,
      10_000,
    );

    expect(subscriptionRepository.deleteById).toHaveBeenCalledWith(
      'sub-failure',
    );
  });

  it('delivers a directly-published failure event to the orchestrator for compensation', async () => {
    const event: SubscriptionNotificationEvent = {
      type: 'confirmation-failed',
      subscriptionId: 'sub-direct-event',
      reason: 'manual test',
    };

    adminChannel.sendToQueue(
      SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE,
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
