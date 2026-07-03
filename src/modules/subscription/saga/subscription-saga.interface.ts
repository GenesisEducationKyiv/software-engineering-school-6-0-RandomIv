import type { SendConfirmationEmailCommand } from './subscription-saga.contract';

export interface SubscriptionSaga {
  start(input: SendConfirmationEmailCommand): Promise<void>;
}
