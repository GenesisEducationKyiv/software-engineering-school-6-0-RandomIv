import amqp from 'amqplib';
import {
  SUBSCRIPTION_SAGA_EVENTS_QUEUE,
  type SubscriptionSagaEvent,
} from './subscription-saga.contract';
import { logger } from '../../../core/logger';

export interface SubscriptionSagaEventHandler {
  handleEvent(event: SubscriptionSagaEvent): Promise<void>;
}

interface ChannelFactory {
  createChannel(): Promise<amqp.Channel>;
}

const handleMessage = async (
  mqChannel: amqp.Channel,
  handler: SubscriptionSagaEventHandler,
  msg: amqp.ConsumeMessage | null,
): Promise<void> => {
  if (!msg) return;

  try {
    const event = JSON.parse(msg.content.toString()) as SubscriptionSagaEvent;

    await handler.handleEvent(event);

    mqChannel.ack(msg);
    logger.info({ type: event.type }, '[Saga] Event processed');
  } catch (error) {
    logger.error({ err: error }, '[Saga] Failed to process event');
    mqChannel.nack(msg, false, !msg.fields.redelivered);
  }
};

const setupChannel = async (
  model: ChannelFactory,
  handler: SubscriptionSagaEventHandler,
): Promise<void> => {
  const mqChannel = await model.createChannel();
  await mqChannel.assertQueue(SUBSCRIPTION_SAGA_EVENTS_QUEUE, {
    durable: true,
  });
  await mqChannel.prefetch(1);

  await mqChannel.consume(SUBSCRIPTION_SAGA_EVENTS_QUEUE, (msg) => {
    void handleMessage(mqChannel, handler, msg);
  });

  logger.info(
    `[Saga] Consumer listening on queue "${SUBSCRIPTION_SAGA_EVENTS_QUEUE}"`,
  );
};

export const startSubscriptionSagaConsumer = async (
  rabbitmqUrl: string,
  handler: SubscriptionSagaEventHandler,
): Promise<amqp.RecoveringChannelModel> => {
  const model = await amqp.connect(rabbitmqUrl, { recovery: true });

  model.on('connect', (reconnected: amqp.ChannelModel) => {
    void setupChannel(reconnected, handler);
  });

  await setupChannel(model, handler);

  return model;
};
