import { Repository } from '../../generated/prisma/client';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';

export interface RepositoryRepositoryPort {
  getOrCreate(fullName: string): Promise<Repository>;
  listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]>;
  updateLastSeenTag(id: string, tag: string): Promise<void>;
}
