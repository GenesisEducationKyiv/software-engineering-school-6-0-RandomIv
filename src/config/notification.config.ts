import { z } from 'zod';
import { rabbitmqSchema } from './rabbitmq.config';

export const notificationSchema = z.object({
  NOTIFICATION_URL: z.url().optional(),
});

export const notificationServiceSchema = z
  .object({
    NOTIFICATION_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .extend(rabbitmqSchema.shape);
