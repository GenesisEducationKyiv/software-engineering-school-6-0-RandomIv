import type {
  Repository,
  Subscription,
} from '../../../../src/generated/prisma/client';
import type { RepositoryWithSubscriptions } from '../../../../src/common/types/repository-with-subscriptions.type';
import { PrismaRepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import { prismaMock } from '../../../mocks/prisma.mock';

const repository: Repository = {
  id: 'repo-1',
  fullName: 'owner/repo',
  lastSeenTag: null,
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const subscription: Subscription = {
  id: 'sub-1',
  email: 'test@example.com',
  confirmed: true,
  confirmationToken: 'd0da028d-0bb7-4458-a7ef-b27c54f58f53',
  unsubscribeToken: '1e6c8c3d-6f6a-4dbf-afb9-ab746fa590e5',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  repositoryId: 'repo-1',
};

const repositoryWithSubscriptions: RepositoryWithSubscriptions = {
  ...repository,
  subscriptions: [subscription],
};

describe('repository.service', () => {
  const service = new PrismaRepositoryRepository(prismaMock);

  describe('getActiveRepositories', () => {
    it('returns repositories with subscriptions and calls prisma with expected query', async () => {
      prismaMock.repository.findMany.mockResolvedValue([
        repositoryWithSubscriptions,
      ]);

      const result = await service.getActiveRepositories();

      expect(result).toEqual([repositoryWithSubscriptions]);
      expect(prismaMock.repository.findMany).toHaveBeenCalledWith({
        where: { subscriptions: { some: { confirmed: true } } },
        include: { subscriptions: { where: { confirmed: true } } },
      });
    });

    it('propagates prisma errors', async () => {
      const error = new Error('DB failed');
      prismaMock.repository.findMany.mockRejectedValue(error);

      await expect(service.getActiveRepositories()).rejects.toThrow(error);
    });
  });

  describe('updateLastSeenTag', () => {
    it('updates and returns repository', async () => {
      const updated: Repository = {
        ...repository,
        lastSeenTag: 'v1.2.3',
      };
      prismaMock.repository.update.mockResolvedValue(updated);

      const result = await service.updateLastSeenTag(repository.id, 'v1.2.3');

      expect(result).toEqual(updated);
      expect(prismaMock.repository.update).toHaveBeenCalledWith({
        where: { id: repository.id },
        data: { lastSeenTag: 'v1.2.3' },
      });
    });

    it('propagates prisma errors', async () => {
      const error = new Error('Update failed');
      prismaMock.repository.update.mockRejectedValue(error);

      await expect(
        service.updateLastSeenTag(repository.id, 'v1.0.0'),
      ).rejects.toThrow(error);
    });
  });

  describe('getOrCreateRepository', () => {
    it('upserts repository by fullName', async () => {
      prismaMock.repository.upsert.mockResolvedValue(repository);

      const result = await service.getOrCreateRepository(repository.fullName);

      expect(result).toEqual(repository);
      expect(prismaMock.repository.upsert).toHaveBeenCalledWith({
        where: { fullName: repository.fullName },
        update: {},
        create: { fullName: repository.fullName },
      });
    });

    it('propagates prisma errors', async () => {
      const error = new Error('Upsert failed');
      prismaMock.repository.upsert.mockRejectedValue(error);

      await expect(
        service.getOrCreateRepository(repository.fullName),
      ).rejects.toThrow(error);
    });
  });
});
