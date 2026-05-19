import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors';
import type {
  SubscriptionEntity,
  SubscriptionWithRepositoryEntity,
} from '../../common/entities';

export interface SubscriptionRepository {
  createSubscription(data: {
    email: string;
    confirmed: boolean;
    repositoryId: string;
  }): Promise<SubscriptionEntity>;

  findByConfirmationToken(token: string): Promise<SubscriptionEntity | null>;

  updateConfirmation(subscriptionId: string): Promise<void>;

  deleteByUnsubscribeToken(token: string): Promise<number>;

  findByEmail(
    email: string,
    confirmedOnly?: boolean,
  ): Promise<SubscriptionWithRepositoryEntity[]>;
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async createSubscription(data: {
    email: string;
    confirmed: boolean;
    repositoryId: string;
  }): Promise<SubscriptionEntity> {
    try {
      return await this.prismaClient.subscription.create({
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Email already subscribed to this repository');
      }

      throw error;
    }
  }

  async findByConfirmationToken(
    token: string,
  ): Promise<SubscriptionEntity | null> {
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

  async findByEmail(
    email: string,
    confirmedOnly = false,
  ): Promise<SubscriptionWithRepositoryEntity[]> {
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
