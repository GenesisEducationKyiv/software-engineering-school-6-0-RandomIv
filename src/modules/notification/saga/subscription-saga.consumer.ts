import amqp from 'amqplib';
import type { NotificationChannel } from '../delivery/notification-channel.interface';
import {
  SEND_CONFIRMATION_COMMAND_QUEUE,
  SUBSCRIPTION_SAGA_EVENTS_QUEUE,
  type SendConfirmationEmailCommand,
  type SubscriptionSagaEvent,
} from '../../subscription/saga/subscription-saga.contract';
import { logger } from '../../../core/logger';

interface ChannelFactory {
  createChannel(): Promise<amqp.Channel>;
}

const publishEvent = (
  mqChannel: amqp.Channel,
  event: SubscriptionSagaEvent,
): void => {
  mqChannel.sendToQueue(
    SUBSCRIPTION_SAGA_EVENTS_QUEUE,
    Buffer.from(JSON.stringify(event)),
    { persistent: true },
  );
};

const handleMessage = async (
  mqChannel: amqp.Channel,
  channel: NotificationChannel,
  msg: amqp.ConsumeMessage | null,
): Promise<void> => {
  if (!msg) return;

  let command: SendConfirmationEmailCommand;
  try {
    command = JSON.parse(
      msg.content.toString(),
    ) as SendConfirmationEmailCommand;
  } catch (error) {
    logger.error({ err: error }, '[Saga] Failed to parse command message');
    mqChannel.nack(msg, false, !msg.fields.redelivered);
    return;
  }

  try {
    await channel.sendConfirmation(
      command.email,
      command.repo,
      command.confirmationUrl,
      command.unsubscribeUrl,
    );

    publishEvent(mqChannel, {
      type: 'confirmation-email-sent',
      subscriptionId: command.subscriptionId,
    });
    mqChannel.ack(msg);
    logger.info(
      { subscriptionId: command.subscriptionId },
      '[Saga] Confirmation email sent',
    );
  } catch (error) {
    logger.error(
      { err: error, subscriptionId: command.subscriptionId },
      '[Saga] Failed to send confirmation email',
    );

    if (!msg.fields.redelivered) {
      mqChannel.nack(msg, false, true);
      return;
    }

    const reason = error instanceof Error ? error.message : 'Unknown error';
    publishEvent(mqChannel, {
      type: 'confirmation-email-failed',
      subscriptionId: command.subscriptionId,
      reason,
    });
    mqChannel.ack(msg);
  }
};

const setupChannel = async (
  model: ChannelFactory,
  channel: NotificationChannel,
): Promise<void> => {
  const mqChannel = await model.createChannel();
  await mqChannel.assertQueue(SEND_CONFIRMATION_COMMAND_QUEUE, {
    durable: true,
  });
  await mqChannel.assertQueue(SUBSCRIPTION_SAGA_EVENTS_QUEUE, {
    durable: true,
  });
  await mqChannel.prefetch(1);

  await mqChannel.consume(SEND_CONFIRMATION_COMMAND_QUEUE, (msg) => {
    void handleMessage(mqChannel, channel, msg);
  });

  logger.info(
    `[Saga] Consumer listening on queue "${SEND_CONFIRMATION_COMMAND_QUEUE}"`,
  );
};

export const startSubscriptionSagaCommandConsumer = async (
  rabbitmqUrl: string,
  channel: NotificationChannel,
): Promise<amqp.RecoveringChannelModel> => {
  const model = await amqp.connect(rabbitmqUrl, { recovery: true });

  model.on('connect', (reconnected: amqp.ChannelModel) => {
    void setupChannel(reconnected, channel);
  });

  await setupChannel(model, channel);

  return model;
};
