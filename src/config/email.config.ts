import { z } from 'zod';

export const emailSchema = z.object({
  EMAIL_USER: z.email(),
  EMAIL_PASS: z.string().min(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
});
