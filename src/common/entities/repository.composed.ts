import type { RepositoryEntity } from './repository.entity';
import type { SubscriptionEntity } from './subscription.entity';

export interface RepositoryWithSubscriptionsEntity extends RepositoryEntity {
  subscriptions: SubscriptionEntity[];
}
