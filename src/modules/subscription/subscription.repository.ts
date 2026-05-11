import { PrismaClient, Subscription } from '../../generated/prisma/client';
import type { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

export interface SubscriptionRepository {
  createSubscription(data: {
    email: string;
    confirmed: boolean;
    repositoryId: string;
  }): Promise<Subscription>;
  
  findByConfirmationToken(token: string): Promise<Subscription | null>;
  
  updateConfirmation(subscriptionId: string): Promise<void>;
  
  deleteByUnsubscribeToken(token: string): Promise<number>;
  
  findByEmail(email: string, confirmedOnly?: boolean): Promise<SubscriptionWithRepository[]>;
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async createSubscription(data: {
    email: string;
    confirmed: boolean;
    repositoryId: string;
  }): Promise<Subscription> {
    return this.prismaClient.subscription.create({
      data,
    });
  }

  async findByConfirmationToken(token: string): Promise<Subscription | null> {
    return this.prismaClient.subscription.findUnique({
      where: { confirmationToken: token },
    });
  }

  async updateConfirmation(subscriptionId: string): Promise<void> {
    await this.prismaClient.subscription.update({
      where: { id: subscriptionId },
      data: { confirmed: true },
    });
  }

  async deleteByUnsubscribeToken(token: string): Promise<number> {
    const result = await this.prismaClient.subscription.deleteMany({
      where: { unsubscribeToken: token },
    });
    return result.count;
  }

  async findByEmail(email: string, confirmedOnly = false): Promise<SubscriptionWithRepository[]> {
    return this.prismaClient.subscription.findMany({
      where: {
        email,
        ...(confirmedOnly && { confirmed: true }),
      },
      include: {
        repository: true,
      },
    });
  }
}
