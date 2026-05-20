import { randomUUID } from 'node:crypto';
import { Repository } from '../../src/generated/prisma/client';
import { RepositoryRepositoryPort } from '../../src/application/ports/repository.repository.port';
import { RepositoryWithSubscriptions } from '../../src/common/types/repository-with-subscriptions.type';

export class InMemoryRepositoryRepository implements RepositoryRepositoryPort {
  readonly byName = new Map<string, Repository>();
  readonly activeOverride: RepositoryWithSubscriptions[] = [];
  readonly tagUpdates: { id: string; tag: string }[] = [];

  async getOrCreate(fullName: string): Promise<Repository> {
    const existing = this.byName.get(fullName);
    if (existing) return existing;
    const created: Repository = {
      id: randomUUID(), fullName, lastSeenTag: null, updatedAt: new Date(),
    };
    this.byName.set(fullName, created);
    return created;
  }

  async listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]> {
    return this.activeOverride;
  }

  async updateLastSeenTag(id: string, tag: string): Promise<void> {
    this.tagUpdates.push({ id, tag });
    for (const repo of this.byName.values()) {
      if (repo.id === id) repo.lastSeenTag = tag;
    }
  }
}
