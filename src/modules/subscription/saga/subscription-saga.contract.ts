export const SEND_CONFIRMATION_COMMAND_QUEUE = 'saga.send-confirmation-email';
export const SUBSCRIPTION_SAGA_EVENTS_QUEUE = 'saga.subscription-events';

export interface SendConfirmationEmailCommand {
  subscriptionId: string;
  email: string;
  repo: string;
  confirmationUrl: string;
  unsubscribeUrl: string;
}

export type SubscriptionSagaEvent =
  | { type: 'confirmation-email-sent'; subscriptionId: string }
  | {
      type: 'confirmation-email-failed';
      subscriptionId: string;
      reason: string;
    };
