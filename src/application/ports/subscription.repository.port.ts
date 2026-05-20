import { Subscription } from '../../domain/subscription/subscription.entity';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

export interface CreateSubscriptionInput {
  email: string;
  repositoryId: string;
}

export interface SubscriptionRepositoryPort {
  create(input: CreateSubscriptionInput): Promise<Subscription>;
  findByConfirmationToken(token: string): Promise<Subscription | null>;
  markConfirmed(id: string): Promise<void>;
  deleteByUnsubscribeToken(token: string): Promise<boolean>;
  deleteById(id: string): Promise<void>;
  findConfirmedByEmail(email: string): Promise<SubscriptionWithRepository[]>;
}
