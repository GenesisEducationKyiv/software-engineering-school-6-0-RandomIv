import { z } from 'zod';

export const emailSchema = z.object({
  EMAIL_USER: z.email(),
  EMAIL_PASS: z.string().min(1),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .catch(undefined),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
