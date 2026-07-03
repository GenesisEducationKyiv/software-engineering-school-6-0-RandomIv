import amqp from 'amqplib';
import {
  startSubscriptionSagaConsumer,
  type SubscriptionSagaEventHandler,
} from '../../../../../src/modules/subscription/saga/subscription-saga.consumer';
import { SUBSCRIPTION_SAGA_EVENTS_QUEUE } from '../../../../../src/modules/subscription/saga/subscription-saga.contract';
import type { SubscriptionSagaEvent } from '../../../../../src/modules/subscription/saga/subscription-saga.contract';

jest.mock('amqplib');

const makeMessage = (
  payload: SubscriptionSagaEvent,
  redelivered = false,
): amqp.ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(payload)),
    fields: { redelivered },
    properties: {},
  }) as unknown as amqp.ConsumeMessage;

describe('subscription-saga.consumer (api side)', () => {
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

  const handler: jest.Mocked<SubscriptionSagaEventHandler> = {
    handleEvent: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (amqp.connect as jest.Mock).mockResolvedValue(model);
  });

  const setup = async () => {
    await startSubscriptionSagaConsumer('amqp://localhost', handler);
    const consumeHandler: (msg: amqp.ConsumeMessage | null) => Promise<void> =
      consume.mock.calls[0][1];
    return consumeHandler;
  };

  it('asserts durable queue and sets prefetch on startup', async () => {
    await startSubscriptionSagaConsumer('amqp://localhost', handler);

    expect(mqChannel.assertQueue).toHaveBeenCalledWith(
      SUBSCRIPTION_SAGA_EVENTS_QUEUE,
      { durable: true },
    );
    expect(mqChannel.prefetch).toHaveBeenCalledWith(1);
  });

  it('routes event to handler and acks', async () => {
    const consumeHandler = await setup();
    const payload: SubscriptionSagaEvent = {
      type: 'confirmation-email-sent',
      subscriptionId: 'sub-1',
    };

    await consumeHandler(makeMessage(payload));

    expect(handler.handleEvent).toHaveBeenCalledWith(payload);
    expect(ack).toHaveBeenCalledTimes(1);
    expect(nack).not.toHaveBeenCalled();
  });

  it('nacks with requeue on first delivery failure', async () => {
    handler.handleEvent.mockRejectedValueOnce(new Error('DB error'));
    const consumeHandler = await setup();
    const payload: SubscriptionSagaEvent = {
      type: 'confirmation-email-failed',
      subscriptionId: 'sub-1',
      reason: 'SMTP error',
    };

    await consumeHandler(makeMessage(payload, false));

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('nacks without requeue when message was already redelivered', async () => {
    handler.handleEvent.mockRejectedValueOnce(new Error('DB error'));
    const consumeHandler = await setup();
    const payload: SubscriptionSagaEvent = {
      type: 'confirmation-email-failed',
      subscriptionId: 'sub-1',
      reason: 'SMTP error',
    };

    await consumeHandler(makeMessage(payload, true));

    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('ignores null message', async () => {
    const consumeHandler = await setup();

    await consumeHandler(null);

    expect(handler.handleEvent).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });
});
