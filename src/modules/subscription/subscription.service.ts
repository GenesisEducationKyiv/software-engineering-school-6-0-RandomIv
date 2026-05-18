import { GitHubService } from '../github/github.service';
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
import { RepositoryRepository } from '../repository/repository.repository';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors';
import { EmailService } from '../notification/email.service';
import { SubscriptionRepository } from './subscription.repository';

interface SubscriptionServiceDependencies {
  subscriptionRepository: SubscriptionRepository;
  githubService: Pick<GitHubService, 'checkRepoExists'>;
  repositoryService: Pick<RepositoryRepository, 'getOrCreateRepository'>;
  emailService: Pick<EmailService, 'sendSubscriptionConfirmationEmail'>;
}

export interface SubscriptionService {
  subscribe(input: SubscribeDto): Promise<Subscription>;
  confirmSubscription(input: TokenParamDto): Promise<void>;
  unsubscribeByToken(input: TokenParamDto): Promise<void>;
  getSubscriptionsByEmail(
    input: SubscriptionsQueryDto,
  ): Promise<SubscriptionWithRepository[]>;
}

export class SubscriptionApplicationService implements SubscriptionService {
  private readonly subscriptionRepository: SubscriptionRepository;
  private readonly githubService: Pick<GitHubService, 'checkRepoExists'>;
  private readonly repositoryService: Pick<
    RepositoryRepository,
    'getOrCreateRepository'
  >;
  private readonly emailService: Pick<
    EmailService,
    'sendSubscriptionConfirmationEmail'
  >;

  constructor(dependencies: SubscriptionServiceDependencies) {
    this.subscriptionRepository = dependencies.subscriptionRepository;
    this.githubService = dependencies.githubService;
    this.repositoryService = dependencies.repositoryService;
    this.emailService = dependencies.emailService;
  }

  async subscribe({ email, repo }: SubscribeDto): Promise<Subscription> {
    const repoExists = await this.githubService.checkRepoExists(repo);

    if (!repoExists) {
      throw new NotFoundError('Repository not found on GitHub');
    }

    const repoRecord: Repository =
      await this.repositoryService.getOrCreateRepository(repo);
    let subscription: Subscription;

    try {
      subscription = await this.subscriptionRepository.createSubscription({
        email,
        confirmed: false,
        repositoryId: repoRecord.id,
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
      await this.emailService.sendSubscriptionConfirmationEmail(
        email,
        repo,
        subscription.confirmationToken,
        subscription.unsubscribeToken,
      );
    } catch (error) {
      await this.subscriptionRepository.deleteByUnsubscribeToken(
        subscription.unsubscribeToken,
      );
      throw error;
    }

    return subscription;
  }

  async confirmSubscription({ token }: TokenParamDto): Promise<void> {
    const subscription =
      await this.subscriptionRepository.findByConfirmationToken(token);

    if (!subscription) {
      throw new NotFoundError('Token not found');
    }

    if (subscription.confirmed) {
      throw new BadRequestError('Token already used');
    }

    await this.subscriptionRepository.updateConfirmation(subscription.id);
  }

  async unsubscribeByToken({ token }: TokenParamDto): Promise<void> {
    const count =
      await this.subscriptionRepository.deleteByUnsubscribeToken(token);

    if (count === 0) {
      throw new NotFoundError('Token not found');
    }
  }

  async getSubscriptionsByEmail({
    email,
  }: SubscriptionsQueryDto): Promise<SubscriptionWithRepository[]> {
    return this.subscriptionRepository.findByEmail(email, true);
  }
}
