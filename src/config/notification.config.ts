import { z } from 'zod';

export const notificationSchema = z.object({
  NOTIFICATION_URL: z.url().optional(),
  NOTIFICATION_GRPC_URL: z.string().optional(),
});

export const notificationServiceSchema = z.object({
  NOTIFICATION_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NOTIFICATION_GRPC_HOST: z.string().default('0.0.0.0'),
  NOTIFICATION_GRPC_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(50061),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),
});
