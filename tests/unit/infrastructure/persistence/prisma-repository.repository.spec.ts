import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '../../../../src/generated/prisma/client';
import { PrismaRepositoryRepository } from '../../../../src/infrastructure/persistence/prisma-repository.repository';

describe('PrismaRepositoryRepository', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let repo: PrismaRepositoryRepository;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    repo = new PrismaRepositoryRepository(prisma);
  });

  it('upserts on getOrCreate', async () => {
    prisma.repository.upsert.mockResolvedValueOnce({
      id: 'r1',
      fullName: 'owner/repo',
      lastSeenTag: null,
      createdAt: new Date(),
    } as never);

    const result = await repo.getOrCreate('owner/repo');

    expect(prisma.repository.upsert).toHaveBeenCalledWith({
      where: { fullName: 'owner/repo' },
      update: {},
      create: { fullName: 'owner/repo' },
    });
    expect(result.id).toBe('r1');
  });

  it('updates lastSeenTag', async () => {
    prisma.repository.update.mockResolvedValueOnce({} as never);
    await repo.updateLastSeenTag('r1', 'v2');
    expect(prisma.repository.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { lastSeenTag: 'v2' },
    });
  });
});
