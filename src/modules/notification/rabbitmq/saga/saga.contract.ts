import { z } from 'zod';

export const SEND_CONFIRMATION_COMMAND_QUEUE = 'notification.send-confirmation';
export const SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE =
  'notification.subscription-events';

export const sendConfirmationCommandSchema = z.object({
  subscriptionId: z.string().min(1),
  to: z.email(),
  repo: z.string().min(1),
  confirmationUrl: z.url(),
  unsubscribeUrl: z.url(),
});

export const subscriptionNotificationEventSchema = z.discriminatedUnion(
  'type',
  [
    z.object({
      type: z.literal('confirmation-sent'),
      subscriptionId: z.string().min(1),
    }),
    z.object({
      type: z.literal('confirmation-failed'),
      subscriptionId: z.string().min(1),
      reason: z.string(),
    }),
  ],
);

export type SendConfirmationCommand = z.infer<
  typeof sendConfirmationCommandSchema
>;
export type SubscriptionNotificationEvent = z.infer<
  typeof subscriptionNotificationEventSchema
>;
