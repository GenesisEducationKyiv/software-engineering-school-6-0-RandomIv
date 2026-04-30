import prisma from '../../common/utils/db';
import { checkRepoExists } from '../github/github.service';
import {
  SubscribeDto,
  SubscriptionsQueryDto,
  TokenParamDto,
} from './subscription.schema';
import {
  Prisma,
  Repository,
  Subscription,
} from '../../generated/prisma/client';
import { SubscriptionWithRepository } from '../../common/types/subscription-with-repository.type';
import { getOrCreateRepository } from '../repository/repository.service';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors';
import { sendSubscriptionConfirmationEmail } from '../notification/email.service';

export const createSubscription = async ({
  email,
  repo,
}: SubscribeDto): Promise<Subscription> => {
  const repoExists = await checkRepoExists(repo);

  if (!repoExists) {
    throw new NotFoundError('Repository not found on GitHub');
  }

  const repoRecord: Repository = await getOrCreateRepository(repo);
  let subscription: Subscription;

  try {
    subscription = await prisma.subscription.create({
      data: {
        email,
        confirmed: false,
        repositoryId: repoRecord.id,
      },
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

  try {
    await sendSubscriptionConfirmationEmail(
      email,
      repo,
      subscription.confirmationToken,
      subscription.unsubscribeToken,
    );
  } catch (error) {
    await prisma.subscription.deleteMany({
      where: { id: subscription.id },
    });
    throw error;
  }

  return subscription;
};

export const confirmSubscription = async ({
  token,
}: TokenParamDto): Promise<void> => {
  const subscription = await prisma.subscription.findUnique({
    where: { confirmationToken: token },
  });

  if (!subscription) {
    throw new NotFoundError('Token not found');
  }

  if (subscription.confirmed) {
    throw new BadRequestError('Token already used');
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { confirmed: true },
  });
};

export const unsubscribeByToken = async ({
  token,
}: TokenParamDto): Promise<void> => {
  const deleteResult = await prisma.subscription.deleteMany({
    where: { unsubscribeToken: token },
  });

  if (deleteResult.count === 0) {
    throw new NotFoundError('Token not found');
  }
};

export const getSubscriptionsByEmail = async ({
  email,
}: SubscriptionsQueryDto): Promise<SubscriptionWithRepository[]> => {
  return prisma.subscription.findMany({
    where: {
      email,
      confirmed: true,
    },
    include: {
      repository: true,
    },
  });
};
