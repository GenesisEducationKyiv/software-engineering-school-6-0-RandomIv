import { randomUUID } from 'node:crypto';
import {
  CreateSubscriptionInput,
  SubscriptionRepositoryPort,
} from '../../src/application/ports/subscription.repository.port';
import { Subscription } from '../../src/domain/subscription/subscription.entity';
import { SubscriptionWithRepository } from '../../src/common/types/subscription-with-repository.type';
import { ConflictError } from '../../src/domain/errors';

interface RepositoryRow { id: string; fullName: string; lastSeenTag: string | null; updatedAt: Date; }

export class InMemorySubscriptionRepository implements SubscriptionRepositoryPort {
  private byId = new Map<string, Subscription>();
  constructor(private readonly repositoriesByName: Map<string, RepositoryRow> = new Map()) {}

  all(): Subscription[] { return [...this.byId.values()]; }

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    const exists = [...this.byId.values()].some(
      s => s.email === input.email && s.repositoryId === input.repositoryId,
    );
    if (exists) {
      throw new ConflictError('Email already subscribed to this repository');
    }
    const sub = new Subscription(
      randomUUID(), input.email, input.repositoryId, randomUUID(), randomUUID(), false,
    );
    this.byId.set(sub.id, sub);
    return sub;
  }

  async findByConfirmationToken(token: string): Promise<Subscription | null> {
    return [...this.byId.values()].find(s => s.confirmationToken === token) ?? null;
  }

  async markConfirmed(id: string): Promise<void> {
    const found = this.byId.get(id);
    if (!found) return;
    this.byId.set(id, found.confirm());
  }

  async deleteByUnsubscribeToken(token: string): Promise<boolean> {
    const target = [...this.byId.values()].find(s => s.unsubscribeToken === token);
    if (!target) return false;
    this.byId.delete(target.id);
    return true;
  }

  async deleteById(id: string): Promise<void> { this.byId.delete(id); }

  async findConfirmedByEmail(email: string): Promise<SubscriptionWithRepository[]> {
    return [...this.byId.values()]
      .filter(s => s.email === email && s.confirmed)
      .map(s => {
        const repo = [...this.repositoriesByName.values()].find(r => r.id === s.repositoryId)
          ?? { id: s.repositoryId, fullName: 'unknown', lastSeenTag: null, updatedAt: new Date() };
        return {
          id: s.id, email: s.email, confirmed: s.confirmed,
          repositoryId: s.repositoryId,
          confirmationToken: s.confirmationToken, unsubscribeToken: s.unsubscribeToken,
          createdAt: new Date(),
          repository: repo,
        } as SubscriptionWithRepository;
      });
  }
}
