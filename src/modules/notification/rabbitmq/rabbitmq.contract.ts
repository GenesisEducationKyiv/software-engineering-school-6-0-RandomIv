import { z } from 'zod';
import type amqp from 'amqplib';
import { confirmationSchema, releaseSchema } from '../notification.schema';

export const NOTIFICATION_QUEUE = 'notifications';
export const NOTIFICATION_DLX = 'notifications.dlx';
export const NOTIFICATION_DLQ = 'notifications.dlq';

export const notificationMessageSchema = z.discriminatedUnion('type', [
  confirmationSchema.extend({ type: z.literal('confirmation') }),
  releaseSchema.extend({ type: z.literal('release') }),
]);

export type NotificationMessage = z.infer<typeof notificationMessageSchema>;

export const setupNotificationTopology = async (
  channel: amqp.Channel,
): Promise<void> => {
  await channel.assertExchange(NOTIFICATION_DLX, 'fanout', { durable: true });
  await channel.assertQueue(NOTIFICATION_DLQ, { durable: true });
  await channel.bindQueue(NOTIFICATION_DLQ, NOTIFICATION_DLX, '');
  await channel.assertQueue(NOTIFICATION_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': NOTIFICATION_DLX },
  });
};
