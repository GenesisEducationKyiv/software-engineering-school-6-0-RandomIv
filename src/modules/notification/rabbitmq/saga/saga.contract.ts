export const SEND_CONFIRMATION_COMMAND_QUEUE = 'notification.send-confirmation';
export const SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE =
  'notification.subscription-events';

export interface SendConfirmationCommand {
  subscriptionId: string;
  to: string;
  repo: string;
  confirmationUrl: string;
  unsubscribeUrl: string;
}

export type SubscriptionNotificationEvent =
  | { type: 'confirmation-sent'; subscriptionId: string }
  | {
      type: 'confirmation-failed';
      subscriptionId: string;
      reason: string;
    };
