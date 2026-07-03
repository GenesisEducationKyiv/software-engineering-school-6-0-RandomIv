import amqp from 'amqplib';
import { startSubscriptionSagaCommandConsumer } from '../../../../../src/modules/notification/saga/subscription-saga.consumer';
import {
  SEND_CONFIRMATION_COMMAND_QUEUE,
  SUBSCRIPTION_SAGA_EVENTS_QUEUE,
} from '../../../../../src/modules/subscription/saga/subscription-saga.contract';
import type { SendConfirmationEmailCommand } from '../../../../../src/modules/subscription/saga/subscription-saga.contract';
import type { NotificationChannel } from '../../../../../src/modules/notification/delivery/notification-channel.interface';

jest.mock('amqplib');

const makeMessage = (
  payload: SendConfirmationEmailCommand,
  redelivered = false,
): amqp.ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(payload)),
    fields: { redelivered },
    properties: {},
  }) as unknown as amqp.ConsumeMessage;

describe('subscription-saga.consumer (notification side)', () => {
  const ack = jest.fn();
  const nack = jest.fn();
  const consume = jest.fn();
  const sendToQueue = jest.fn();

  const mqChannel = {
    assertQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn(),
    consume,
    ack,
    nack,
    sendToQueue,
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

  const payload: SendConfirmationEmailCommand = {
    subscriptionId: 'sub-1',
    email: 'user@example.com',
    repo: 'owner/repo',
    confirmationUrl: 'https://app.example.com/confirm/token',
    unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (amqp.connect as jest.Mock).mockResolvedValue(model);
  });

  const setup = async () => {
    await startSubscriptionSagaCommandConsumer('amqp://localhost', channel);
    const handler: (msg: amqp.ConsumeMessage | null) => Promise<void> =
      consume.mock.calls[0][1];
    return handler;
  };

  it('asserts both durable queues and sets prefetch on startup', async () => {
    await startSubscriptionSagaCommandConsumer('amqp://localhost', channel);

    expect(mqChannel.assertQueue).toHaveBeenCalledWith(
      SEND_CONFIRMATION_COMMAND_QUEUE,
      { durable: true },
    );
    expect(mqChannel.assertQueue).toHaveBeenCalledWith(
      SUBSCRIPTION_SAGA_EVENTS_QUEUE,
      { durable: true },
    );
    expect(mqChannel.prefetch).toHaveBeenCalledWith(1);
  });

  it('sends confirmation, publishes sent event and acks on success', async () => {
    const handler = await setup();

    await handler(makeMessage(payload));

    expect(channel.sendConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );
    expect(sendToQueue).toHaveBeenCalledWith(
      SUBSCRIPTION_SAGA_EVENTS_QUEUE,
      Buffer.from(
        JSON.stringify({
          type: 'confirmation-email-sent',
          subscriptionId: 'sub-1',
        }),
      ),
      { persistent: true },
    );
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks with requeue on first delivery failure without publishing an event', async () => {
    channel.sendConfirmation.mockRejectedValueOnce(new Error('SMTP error'));
    const handler = await setup();

    await handler(makeMessage(payload, false));

    expect(sendToQueue).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('publishes a failed event and acks (drops) when redelivery also fails', async () => {
    channel.sendConfirmation.mockRejectedValueOnce(new Error('SMTP error'));
    const handler = await setup();

    await handler(makeMessage(payload, true));

    expect(sendToQueue).toHaveBeenCalledWith(
      SUBSCRIPTION_SAGA_EVENTS_QUEUE,
      Buffer.from(
        JSON.stringify({
          type: 'confirmation-email-failed',
          subscriptionId: 'sub-1',
          reason: 'SMTP error',
        }),
      ),
      { persistent: true },
    );
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks a malformed message without crashing', async () => {
    const handler = await setup();
    const malformed = {
      content: Buffer.from('not-json'),
      fields: { redelivered: false },
      properties: {},
    } as unknown as amqp.ConsumeMessage;

    await handler(malformed);

    expect(channel.sendConfirmation).not.toHaveBeenCalled();
    expect(sendToQueue).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('ignores null message', async () => {
    const handler = await setup();

    await handler(null);

    expect(channel.sendConfirmation).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });
});
