export interface SubscriptionEntity {
  id: string;
  email: string;
  confirmed: boolean;
  confirmationToken: string;
  unsubscribeToken: string;
  createdAt: Date;
  repositoryId: string;
}
