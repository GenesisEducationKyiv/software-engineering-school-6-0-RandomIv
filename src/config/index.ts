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
  process.stderr.write('Invalid or missing environment variables\n');
  process.stderr.write(
    `${JSON.stringify(z.treeifyError(parsed.error), null, 2)}\n`,
  );

  process.exit(1);
}

export const config = parsed.data;
