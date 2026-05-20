import { z } from 'zod';

export const subscribeSchema = z.object({
  email: z.email('Invalid email address format'),
  repo: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,
      'Repository must be in owner/repo format',
    ),
});

export const tokenParamSchema = z.object({
  token: z.uuid('Invalid token'),
});

export const subscriptionsQuerySchema = z.object({
  email: z.email('Invalid email address format'),
});

export type SubscribeDto = z.infer<typeof subscribeSchema>;
export type TokenParamDto = z.infer<typeof tokenParamSchema>;
export type SubscriptionsQueryDto = z.infer<typeof subscriptionsQuerySchema>;
