import { Prisma, PrismaClient } from '../../generated/prisma/client';
import { Subscription } from '../../domain/subscription/subscription.entity';
import { ConflictError } from '../../domain/errors';
import {
  CreateSubscriptionInput,
  SubscriptionRepositoryPort,
} from '../../application/ports/subscription.repository.port';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';

type SubscriptionRow = Prisma.SubscriptionGetPayload<object>;

const toEntity = (row: SubscriptionRow): Subscription =>
  new Subscription(
    row.id,
    row.email,
    row.repositoryId,
    row.confirmationToken,
    row.unsubscribeToken,
    row.confirmed,
  );

export class PrismaSubscriptionRepository implements SubscriptionRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateSubscriptionInput): Promise<Subscription> {
    try {
      const row = await this.prisma.subscription.create({
        data: {
          email: input.email,
          confirmed: false,
          repositoryId: input.repositoryId,
        },
      });
      return toEntity(row);
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

  async findByConfirmationToken(token: string): Promise<Subscription | null> {
    const row = await this.prisma.subscription.findUnique({
      where: { confirmationToken: token },
    });
    return row ? toEntity(row) : null;
  }

  async markConfirmed(id: string): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: { confirmed: true },
    });
  }

  async deleteByUnsubscribeToken(token: string): Promise<boolean> {
    const result = await this.prisma.subscription.deleteMany({
      where: { unsubscribeToken: token },
    });
    return result.count > 0;
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.subscription.deleteMany({ where: { id } });
  }

  async findConfirmedByEmail(
    email: string,
  ): Promise<SubscriptionWithRepository[]> {
    return this.prisma.subscription.findMany({
      where: { email, confirmed: true },
      include: { repository: true },
    });
  }
}
