export interface SubscriptionSagaContext {
  subscriptionId: string;
  to: string;
  repo: string;
  confirmationUrl: string;
  unsubscribeUrl: string;
}

export interface SubscriptionSagaStarter {
  start(context: SubscriptionSagaContext): Promise<void>;
}
