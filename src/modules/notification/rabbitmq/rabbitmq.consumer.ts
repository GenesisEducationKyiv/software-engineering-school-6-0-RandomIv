import amqp from 'amqplib';
import type { NotificationChannel } from '../delivery/notification-channel.interface';
import {
  NOTIFICATION_QUEUE,
  notificationMessageSchema,
  setupNotificationTopology,
} from './rabbitmq.contract';
import { logger } from '../../../core/logger';

interface ChannelFactory {
  createChannel(): Promise<amqp.Channel>;
}

const MAX_SEEN_IDS = 1000;
const processedMessageIds = new Set<string>();

const markProcessed = (messageId: string): void => {
  processedMessageIds.add(messageId);
  if (processedMessageIds.size > MAX_SEEN_IDS) {
    processedMessageIds.delete(processedMessageIds.values().next().value!);
  }
};

const handleMessage = async (
  mqChannel: amqp.Channel,
  channel: NotificationChannel,
  msg: amqp.ConsumeMessage | null,
): Promise<void> => {
  if (!msg) return;

  try {
    const message = notificationMessageSchema.parse(
      JSON.parse(msg.content.toString()),
    );

    const messageId =
      typeof msg.properties.messageId === 'string'
        ? msg.properties.messageId
        : undefined;

    if (messageId && processedMessageIds.has(messageId)) {
      mqChannel.ack(msg);
      logger.info({ type: message.type }, '[MQ] Duplicate message skipped');
      return;
    }

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

    if (messageId) markProcessed(messageId);
    mqChannel.ack(msg);
    logger.info({ type: message.type }, '[MQ] Message processed');
  } catch (error) {
    logger.error({ err: error }, '[MQ] Failed to process message');
    mqChannel.nack(msg, false, !msg.fields.redelivered);
  }
};

const setupChannel = async (
  model: ChannelFactory,
  channel: NotificationChannel,
): Promise<void> => {
  const mqChannel = await model.createChannel();
  await setupNotificationTopology(mqChannel);
  await mqChannel.prefetch(1);

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
