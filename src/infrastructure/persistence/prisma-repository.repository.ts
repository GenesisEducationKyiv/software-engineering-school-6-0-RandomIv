import { PrismaClient, Repository } from '../../generated/prisma/client';
import { RepositoryRepositoryPort } from '../../application/ports/repository.repository.port';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';

export class PrismaRepositoryRepository implements RepositoryRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreate(fullName: string): Promise<Repository> {
    return this.prisma.repository.upsert({
      where: { fullName },
      update: {},
      create: { fullName },
    });
  }

  async listActiveWithSubscribers(): Promise<RepositoryWithSubscriptions[]> {
    return this.prisma.repository.findMany({
      where: { subscriptions: { some: { confirmed: true } } },
      include: { subscriptions: { where: { confirmed: true } } },
    });
  }

  async updateLastSeenTag(id: string, tag: string): Promise<void> {
    await this.prisma.repository.update({
      where: { id },
      data: { lastSeenTag: tag },
    });
  }
}
