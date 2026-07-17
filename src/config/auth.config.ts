import { z } from 'zod';

export const authSchema = z.object({
  API_KEY: z.string().min(1),
});
