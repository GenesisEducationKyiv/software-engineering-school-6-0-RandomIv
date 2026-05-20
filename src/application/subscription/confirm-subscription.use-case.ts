import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { NotFoundError } from '../../domain/errors';

export interface ConfirmInput { token: string; }

export class ConfirmSubscriptionUseCase {
  constructor(private readonly subscriptions: SubscriptionRepositoryPort) {}

  async execute({ token }: ConfirmInput): Promise<void> {
    const subscription = await this.subscriptions.findByConfirmationToken(token);
    if (!subscription) throw new NotFoundError('Token not found');

    subscription.confirm(); // enforces the invariant; throws BadRequestError if already confirmed
    await this.subscriptions.markConfirmed(subscription.id);
  }
}
