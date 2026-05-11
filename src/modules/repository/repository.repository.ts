import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';
import { PrismaClient, Repository } from '../../generated/prisma/client';

export interface RepositoryRepository {
  getActiveRepositories(): Promise<RepositoryWithSubscriptions[]>;
  updateLastSeenTag(id: string, tag: string): Promise<Repository>;
  getOrCreateRepository(fullName: string): Promise<Repository>;
}

export class PrismaRepositoryRepository implements RepositoryRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async getActiveRepositories(): Promise<RepositoryWithSubscriptions[]> {
    return this.prismaClient.repository.findMany({
      where: {
        subscriptions: {
          some: { confirmed: true },
        },
      },
      include: {
        subscriptions: {
          where: { confirmed: true },
        },
      },
    });
  }

  async updateLastSeenTag(id: string, tag: string): Promise<Repository> {
    return this.prismaClient.repository.update({
      where: { id },
      data: { lastSeenTag: tag },
    });
  }

  async getOrCreateRepository(fullName: string): Promise<Repository> {
    return this.prismaClient.repository.upsert({
      where: { fullName },
      update: {},
      create: { fullName },
    });
  }
}
