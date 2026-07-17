import { z } from 'zod';

export const cacheSchema = z.object({
  REDIS_URL: z.url().optional(),
});
