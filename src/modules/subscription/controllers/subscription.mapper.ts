import type { SubscriptionWithRepositoryEntity } from '../entities/subscription-with-repository.entity';

export type SubscriptionDto = {
  email: string;
  repo: string;
  confirmed: boolean;
  last_seen_tag?: string;
};

export const toSubscriptionDto = (
  subscription: SubscriptionWithRepositoryEntity,
): SubscriptionDto => ({
  email: subscription.email,
  repo: subscription.repository.fullName,
  confirmed: subscription.confirmed,
  ...(subscription.repository.lastSeenTag
    ? { last_seen_tag: subscription.repository.lastSeenTag }
    : {}),
});
