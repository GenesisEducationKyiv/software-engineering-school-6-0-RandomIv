import amqp from 'amqplib';
import type { NotificationChannel } from '../delivery/notification-channel.interface';
import {
  NOTIFICATION_QUEUE,
  type NotificationMessage,
} from './rabbitmq.contract';
import { logger } from '../../../core/logger';

interface ChannelFactory {
  createChannel(): Promise<amqp.Channel>;
}

const handleMessage = async (
  mqChannel: amqp.Channel,
  channel: NotificationChannel,
  msg: amqp.ConsumeMessage | null,
): Promise<void> => {
  if (!msg) return;

  try {
    const message = JSON.parse(msg.content.toString()) as NotificationMessage;

    if (message.type === 'confirmation') {
      await channel.sendConfirmation(
        message.to,
        message.repo,
        message.confirmationUrl,
        message.unsubscribeUrl,
      );
    } else {
      await channel.sendRelease(
        message.to,
        message.repo,
        message.tag,
        message.releaseUrl,
        message.unsubscribeUrl,
      );
    }

    mqChannel.ack(msg);
    logger.info({ type: message.type }, '[MQ] Message processed');
  } catch (error) {
    logger.error({ err: error }, '[MQ] Failed to process message');
    // requeue once; drop on redelivery to avoid infinite loop
    mqChannel.nack(msg, false, !msg.fields.redelivered);
  }
};

const setupChannel = async (
  model: ChannelFactory,
  channel: NotificationChannel,
): Promise<void> => {
  const mqChannel = await model.createChannel();
  await mqChannel.assertQueue(NOTIFICATION_QUEUE, { durable: true });
  await mqChannel.prefetch(1);

  // fire-and-forget: prefetch(1) throttles delivery, ack/nack happens inside handleMessage
  await mqChannel.consume(NOTIFICATION_QUEUE, (msg) => {
    void handleMessage(mqChannel, channel, msg);
  });

  logger.info(`[MQ] Consumer listening on queue "${NOTIFICATION_QUEUE}"`);
};

export const startMqConsumer = async (
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
