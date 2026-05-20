import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

export interface ListSubscriptionsInput { email: string; }

export class ListSubscriptionsUseCase {
  constructor(private readonly subscriptions: SubscriptionRepositoryPort) {}

  async execute({ email }: ListSubscriptionsInput): Promise<SubscriptionWithRepository[]> {
    return this.subscriptions.findConfirmedByEmail(email);
  }
}
