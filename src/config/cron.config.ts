import cron from 'node-cron';
import { z } from 'zod';

export const DEFAULT_RELEASE_CHECK_CRON = '*/5 * * * *';

export const cronSchema = z.object({
  RELEASE_CHECK_CRON: z
    .string()
    .default(DEFAULT_RELEASE_CHECK_CRON)
    .refine((value) => cron.validate(value), {
      message:
        'Invalid cron expression for RELEASE_CHECK_CRON (example: */5 * * * *)',
    }),
});
