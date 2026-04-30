import prisma from '../../common/utils/db';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';
import { Repository } from '../../generated/prisma/client';
export const getActiveRepositories = async (): Promise<
  RepositoryWithSubscriptions[]
> => {
  return prisma.repository.findMany({
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
};

export const updateLastSeenTag = async (
  id: string,
  tag: string,
): Promise<Repository> => {
  return prisma.repository.update({
    where: { id },
    data: { lastSeenTag: tag },
  });
};
export const getOrCreateRepository = async (
  fullName: string,
): Promise<Repository> => {
  return prisma.repository.upsert({
    where: { fullName },
    update: {},
    create: { fullName },
  });
};
