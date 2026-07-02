import { z } from 'zod';

export const confirmationSchema = z.object({
  to: z.email(),
  repo: z.string().min(1),
  confirmationUrl: z.url(),
  unsubscribeUrl: z.url(),
});

export const releaseSchema = z.object({
  to: z.email(),
  repo: z.string().min(1),
  tag: z.string().min(1),
  releaseUrl: z.url(),
  unsubscribeUrl: z.url(),
});

export type ConfirmationDto = z.infer<typeof confirmationSchema>;
export type ReleaseDto = z.infer<typeof releaseSchema>;
