import { z } from 'zod';
import { confirmationSchema, releaseSchema } from '../notification.schema';

export const NOTIFICATION_QUEUE = 'notifications';

export const notificationMessageSchema = z.discriminatedUnion('type', [
  confirmationSchema.extend({ type: z.literal('confirmation') }),
  releaseSchema.extend({ type: z.literal('release') }),
]);

export type NotificationMessage = z.infer<typeof notificationMessageSchema>;
