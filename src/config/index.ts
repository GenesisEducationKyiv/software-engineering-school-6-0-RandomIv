import 'dotenv/config';
import { z } from 'zod';
import { appSchema } from './app.config';
import { authSchema } from './auth.config';
import { cacheSchema } from './cache.config';
import { cronSchema } from './cron.config';
import { databaseSchema } from './database.config';
import { grpcSchema } from './grpc.config';
import { githubSchema } from './github.config';
import { notificationSchema } from './notification.config';
import { rabbitmqSchema } from './rabbitmq.config';
import { logger } from '../core/logger';

const schema = appSchema
  .extend(authSchema.shape)
  .extend(cacheSchema.shape)
  .extend(cronSchema.shape)
  .extend(databaseSchema.shape)
  .extend(grpcSchema.shape)
  .extend(githubSchema.shape)
  .extend(notificationSchema.shape)
  .extend(rabbitmqSchema.shape);

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  logger.error('Invalid or missing environment variables');
  logger.error({ validationError: z.treeifyError(parsed.error) });

  process.exit(1);
}

export const config = parsed.data;
