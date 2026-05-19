import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

export type SubscriptionDto = {
  email: string;
  repo: string;
  confirmed: boolean;
  last_seen_tag?: string;
};

export const toSubscriptionDto = (
  subscription: SubscriptionWithRepository,
): SubscriptionDto => ({
  email: subscription.email,
  repo: subscription.repository.fullName,
  confirmed: subscription.confirmed,
  ...(subscription.repository.lastSeenTag
    ? { last_seen_tag: subscription.repository.lastSeenTag }
    : {}),
});
