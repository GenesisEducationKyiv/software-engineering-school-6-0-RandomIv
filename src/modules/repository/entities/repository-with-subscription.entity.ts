import type { SubscriptionEntity } from '../../subscription/entities/subscription.entity';
import type { RepositoryEntity } from './repository.entity';

export interface RepositoryWithSubscriptionsEntity extends RepositoryEntity {
  subscriptions: SubscriptionEntity[];
}
