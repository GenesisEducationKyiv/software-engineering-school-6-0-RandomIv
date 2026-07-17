import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { ConflictError } from '../../common/errors';
import type { SubscriptionEntity } from './entities/subscription.entity';
import type { SubscriptionWithRepositoryEntity } from './entities/subscription-with-repository.entity';
import type { SubscriptionRepositoryInterface } from './interfaces/subscription-repository.interface';

export class PrismaSubscriptionRepository implements SubscriptionRepositoryInterface {
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

  async confirmByToken(token: string): Promise<number> {
    const result = await this.prismaClient.subscription.updateMany({
      where: { confirmationToken: token, confirmed: false },
      data: { confirmed: true },
    });
    return result.count;
  }

  async deleteByUnsubscribeToken(token: string): Promise<number> {
    const result = await this.prismaClient.subscription.deleteMany({
      where: { unsubscribeToken: token },
    });
    return result.count;
  }

  async deleteById(id: string): Promise<number> {
    const result = await this.prismaClient.subscription.deleteMany({
      where: { id, confirmed: false },
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
