import 'dotenv/config';
import { z } from 'zod';
import { appSchema } from './app.config';
import { authSchema } from './auth.config';
import { cacheSchema } from './cache.config';
import { cronSchema } from './cron.config';
import { databaseSchema } from './database.config';
import { emailSchema } from './email.config';
import { grpcSchema } from './grpc.config';
import { githubSchema } from './github.config';

const schema = appSchema
  .extend(authSchema.shape)
  .extend(cacheSchema.shape)
  .extend(cronSchema.shape)
  .extend(databaseSchema.shape)
  .extend(emailSchema.shape)
  .extend(grpcSchema.shape)
  .extend(githubSchema.shape);

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid or missing environment variables');
  console.error({ validationError: z.treeifyError(parsed.error) });

  process.exit(1);
}

export const config = parsed.data;
