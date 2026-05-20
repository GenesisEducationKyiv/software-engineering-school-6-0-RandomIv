import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { NotFoundError } from '../../domain/errors';

export interface UnsubscribeInput { token: string; }

export class UnsubscribeUseCase {
  constructor(private readonly subscriptions: SubscriptionRepositoryPort) {}

  async execute({ token }: UnsubscribeInput): Promise<void> {
    const removed = await this.subscriptions.deleteByUnsubscribeToken(token);
    if (!removed) throw new NotFoundError('Token not found');
  }
}
