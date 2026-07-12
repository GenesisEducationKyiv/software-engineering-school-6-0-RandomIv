import { z } from 'zod';

export const notificationSchema = z.object({
  NOTIFICATION_URL: z.url(),
  NOTIFICATION_API_KEY: z.string().min(1),
});

export const notificationServiceSchema = z.object({
  NOTIFICATION_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NOTIFICATION_API_KEY: z.string().min(1),
});
