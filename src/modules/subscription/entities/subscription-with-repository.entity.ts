import type { RepositoryEntity } from '../../repository/entities/repository.entity';
import type { SubscriptionEntity } from './subscription.entity';

export interface SubscriptionWithRepositoryEntity extends SubscriptionEntity {
  repository: RepositoryEntity;
}
