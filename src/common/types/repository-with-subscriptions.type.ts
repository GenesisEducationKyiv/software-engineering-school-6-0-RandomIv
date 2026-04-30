import { Prisma } from '../../generated/prisma/client';
export type RepositoryWithSubscriptions = Prisma.RepositoryGetPayload<{
  include: { subscriptions: true };
}>;
