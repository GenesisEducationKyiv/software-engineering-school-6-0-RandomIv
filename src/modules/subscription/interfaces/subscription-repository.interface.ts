import type { SubscriptionEntity } from '../entities/subscription.entity';
import type { SubscriptionWithRepositoryEntity } from '../entities/subscription-with-repository.entity';

export interface SubscriptionRepositoryInterface {
  createSubscription(data: {
    email: string;
    confirmed: boolean;
    repositoryId: string;
  }): Promise<SubscriptionEntity>;

  findByConfirmationToken(token: string): Promise<SubscriptionEntity | null>;

  updateConfirmation(subscriptionId: string): Promise<void>;

  deleteByUnsubscribeToken(token: string): Promise<number>;

  findByEmail(
    email: string,
    confirmedOnly?: boolean,
  ): Promise<SubscriptionWithRepositoryEntity[]>;
}
