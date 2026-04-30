import { z } from 'zod';

export const emailSchema = z.object({
  EMAIL_USER: z.email(),
  EMAIL_PASS: z.string().min(1),
});
