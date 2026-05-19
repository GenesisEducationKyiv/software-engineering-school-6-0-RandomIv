import type {
  RepositoryEntity,
  RepositoryWithSubscriptionsEntity,
  SubscriptionEntity,
} from '../../../../src/common/entities';
import { PrismaRepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import { prismaMock } from '../../../mocks/prisma.mock';

const repositoryRecord: RepositoryEntity = {
  id: 'repo-1',
  fullName: 'owner/repo',
  lastSeenTag: null,
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const subscriptionRecord: SubscriptionEntity = {
  id: 'sub-1',
  email: 'test@example.com',
  confirmed: true,
  confirmationToken: 'd0da028d-0bb7-4458-a7ef-b27c54f58f53',
  unsubscribeToken: '1e6c8c3d-6f6a-4dbf-afb9-ab746fa590e5',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  repositoryId: 'repo-1',
};

const repositoryWithSubscriptions: RepositoryWithSubscriptionsEntity = {
  ...repositoryRecord,
  subscriptions: [subscriptionRecord],
};

describe('repository.repository', () => {
  const repository = new PrismaRepositoryRepository(prismaMock);

  describe('getActiveRepositories', () => {
    it('returns repositories with subscriptions and calls prisma with expected query', async () => {
      prismaMock.repository.findMany.mockResolvedValue([
        repositoryWithSubscriptions,
      ]);

      const result = await repository.getActiveRepositories();

      expect(result).toEqual([repositoryWithSubscriptions]);
      expect(prismaMock.repository.findMany).toHaveBeenCalledWith({
        where: { subscriptions: { some: { confirmed: true } } },
        include: { subscriptions: { where: { confirmed: true } } },
      });
    });

    it('propagates prisma errors', async () => {
      const error = new Error('DB failed');
      prismaMock.repository.findMany.mockRejectedValue(error);

      await expect(repository.getActiveRepositories()).rejects.toThrow(error);
    });
  });

  describe('updateLastSeenTag', () => {
    it('updates and returns repository', async () => {
      const updated: RepositoryEntity = {
        ...repositoryRecord,
        lastSeenTag: 'v1.2.3',
      };
      prismaMock.repository.update.mockResolvedValue(updated);

      const result = await repository.updateLastSeenTag(
        repositoryRecord.id,
        'v1.2.3',
      );

      expect(result).toEqual(updated);
      expect(prismaMock.repository.update).toHaveBeenCalledWith({
        where: { id: repositoryRecord.id },
        data: { lastSeenTag: 'v1.2.3' },
      });
    });

    it('propagates prisma errors', async () => {
      const error = new Error('Update failed');
      prismaMock.repository.update.mockRejectedValue(error);

      await expect(
        repository.updateLastSeenTag(repositoryRecord.id, 'v1.0.0'),
      ).rejects.toThrow(error);
    });
  });

  describe('getOrCreateRepository', () => {
    it('upserts repository by fullName', async () => {
      prismaMock.repository.upsert.mockResolvedValue(repositoryRecord);

      const result = await repository.getOrCreateRepository(
        repositoryRecord.fullName,
      );

      expect(result).toEqual(repositoryRecord);
      expect(prismaMock.repository.upsert).toHaveBeenCalledWith({
        where: { fullName: repositoryRecord.fullName },
        update: {},
        create: { fullName: repositoryRecord.fullName },
      });
    });

    it('propagates prisma errors', async () => {
      const error = new Error('Upsert failed');
      prismaMock.repository.upsert.mockRejectedValue(error);

      await expect(
        repository.getOrCreateRepository(repositoryRecord.fullName),
      ).rejects.toThrow(error);
    });
  });
});
