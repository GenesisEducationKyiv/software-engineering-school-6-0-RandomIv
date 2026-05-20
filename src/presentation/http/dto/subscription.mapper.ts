import { SubscriptionWithRepository } from '../../../common/types/subscription-with-repository.type';

export const toSubscriptionDto = (
  subscription: SubscriptionWithRepository,
): {
  email: string;
  repo: string;
  confirmed: boolean;
  last_seen_tag?: string;
} => {
  return {
    email: subscription.email,
    repo: subscription.repository.fullName,
    confirmed: subscription.confirmed,
    ...(subscription.repository.lastSeenTag
      ? { last_seen_tag: subscription.repository.lastSeenTag }
      : {}),
  };
};
