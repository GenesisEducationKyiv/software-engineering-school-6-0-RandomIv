import { z } from 'zod';

export const githubSchema = z.object({
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
});
