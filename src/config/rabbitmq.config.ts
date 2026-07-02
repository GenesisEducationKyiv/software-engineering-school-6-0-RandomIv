import { z } from 'zod';

export const rabbitmqSchema = z.object({
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),
});
