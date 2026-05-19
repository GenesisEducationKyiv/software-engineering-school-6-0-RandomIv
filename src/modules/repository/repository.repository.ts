import type {
  RepositoryEntity,
  RepositoryWithSubscriptionsEntity,
} from '../../common/entities';
import { PrismaClient } from '../../generated/prisma/client';

export interface RepositoryRepository {
  getActiveRepositories(): Promise<RepositoryWithSubscriptionsEntity[]>;
  updateLastSeenTag(id: string, tag: string): Promise<RepositoryEntity>;
  getOrCreateRepository(fullName: string): Promise<RepositoryEntity>;
}

export class PrismaRepositoryRepository implements RepositoryRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async getActiveRepositories(): Promise<RepositoryWithSubscriptionsEntity[]> {
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

  async updateLastSeenTag(id: string, tag: string): Promise<RepositoryEntity> {
    return this.prismaClient.repository.update({
      where: { id },
      data: { lastSeenTag: tag },
    });
  }

  async getOrCreateRepository(fullName: string): Promise<RepositoryEntity> {
    return this.prismaClient.repository.upsert({
      where: { fullName },
      update: {},
      create: { fullName },
    });
  }
}
