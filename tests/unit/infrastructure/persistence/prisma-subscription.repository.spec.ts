import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient, Prisma } from '../../../../src/generated/prisma/client';
import { PrismaSubscriptionRepository } from '../../../../src/infrastructure/persistence/prisma-subscription.repository';
import { ConflictError } from '../../../../src/domain/errors';

describe('PrismaSubscriptionRepository', () => {
  let prisma: DeepMockProxy<PrismaClient>;
  let repo: PrismaSubscriptionRepository;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    repo = new PrismaSubscriptionRepository(prisma);
  });

  it('translates Prisma P2002 to ConflictError on create', async () => {
    prisma.subscription.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );

    await expect(
      repo.create({ email: 'a@b.c', repositoryId: 'r1' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
