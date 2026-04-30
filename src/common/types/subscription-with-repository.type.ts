import { Prisma } from '../../generated/prisma/client';

export type SubscriptionWithRepository = Prisma.SubscriptionGetPayload<{
  include: { repository: true };
}>;
