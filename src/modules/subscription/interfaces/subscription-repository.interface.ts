import type { SubscriptionEntity } from '../entities/subscription.entity';
import type { SubscriptionWithRepositoryEntity } from '../entities/subscription-with-repository.entity';

export interface SubscriptionRepositoryInterface {
  createSubscription(data: {
    email: string;
    confirmed: boolean;
    repositoryId: string;
  }): Promise<SubscriptionEntity>;

  findByConfirmationToken(token: string): Promise<SubscriptionEntity | null>;

  confirmByToken(token: string): Promise<number>;

  deleteByUnsubscribeToken(token: string): Promise<number>;

  findByEmail(
    email: string,
    confirmedOnly?: boolean,
  ): Promise<SubscriptionWithRepositoryEntity[]>;
}
