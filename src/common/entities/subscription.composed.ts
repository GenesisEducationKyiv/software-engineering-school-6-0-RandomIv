import type { SubscriptionEntity } from './subscription.entity';
import type { RepositoryEntity } from './repository.entity';

export interface SubscriptionWithRepositoryEntity extends SubscriptionEntity {
  repository: RepositoryEntity;
}
