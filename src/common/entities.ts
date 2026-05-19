export interface RepositoryEntity {
  id: string;
  fullName: string;
  lastSeenTag: string | null;
  updatedAt: Date;
}

export interface SubscriptionEntity {
  id: string;
  email: string;
  confirmed: boolean;
  confirmationToken: string;
  unsubscribeToken: string;
  createdAt: Date;
  repositoryId: string;
}

export interface RepositoryWithSubscriptionsEntity extends RepositoryEntity {
  subscriptions: SubscriptionEntity[];
}

export interface SubscriptionWithRepositoryEntity extends SubscriptionEntity {
  repository: RepositoryEntity;
}
