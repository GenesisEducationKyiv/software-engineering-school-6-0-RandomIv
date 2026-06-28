import { z } from 'zod';

export const sendConfirmationSchema = z.object({
  to: z.email(),
  repo: z.string().min(1),
  confirmationUrl: z.url(),
  unsubscribeUrl: z.url(),
});

export const sendReleaseSchema = z.object({
  to: z.email(),
  repo: z.string().min(1),
  tag: z.string().min(1),
  releaseUrl: z.url(),
  unsubscribeUrl: z.url(),
});

export type SendConfirmationDto = z.infer<typeof sendConfirmationSchema>;
export type SendReleaseDto = z.infer<typeof sendReleaseSchema>;
