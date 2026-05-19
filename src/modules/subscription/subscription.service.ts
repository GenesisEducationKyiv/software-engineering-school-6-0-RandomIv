import { RepositoryProvider } from '../../integrations/github/github.service';
import {
  SubscribeDto,
  SubscriptionsQueryDto,
  TokenParamDto,
} from './subscription.schema';
import type {
  SubscriptionEntity,
  SubscriptionWithRepositoryEntity,
} from '../../common/entities';
import { RepositoryRepository } from '../repository/repository.repository';
import { BadRequestError, NotFoundError } from '../../common/errors';
import { EmailService } from '../../integrations/email/email.service';
import { SubscriptionRepository } from './subscription.repository';
import { AppUrls } from '../../common/utils/url-builder.util';

export interface SubscriptionServiceDependencies {
  subscriptionRepository: SubscriptionRepository;
  repositoryProvider: RepositoryProvider;
  repositoryRepository: RepositoryRepository;
  emailService: EmailService;
  appBaseUrl: string;
}

export interface SubscriptionService {
  subscribe(input: SubscribeDto): Promise<SubscriptionEntity>;
  confirmSubscription(input: TokenParamDto): Promise<void>;
  unsubscribeByToken(input: TokenParamDto): Promise<void>;
  getSubscriptionsByEmail(
    input: SubscriptionsQueryDto,
  ): Promise<SubscriptionWithRepositoryEntity[]>;
}

export class SubscriptionApplicationService implements SubscriptionService {
  private readonly subscriptionRepository: SubscriptionRepository;
  private readonly repositoryProvider: RepositoryProvider;
  private readonly repositoryRepository: RepositoryRepository;
  private readonly emailService: EmailService;
  private readonly appBaseUrl: string;

  constructor(dependencies: SubscriptionServiceDependencies) {
    this.subscriptionRepository = dependencies.subscriptionRepository;
    this.repositoryProvider = dependencies.repositoryProvider;
    this.repositoryRepository = dependencies.repositoryRepository;
    this.emailService = dependencies.emailService;
    this.appBaseUrl = dependencies.appBaseUrl;
  }

  async subscribe({ email, repo }: SubscribeDto): Promise<SubscriptionEntity> {
    await this.validateRepositoryExists(repo);

    const repoRecord =
      await this.repositoryRepository.getOrCreateRepository(repo);

    const subscription = await this.subscriptionRepository.createSubscription({
      email,
      confirmed: false,
      repositoryId: repoRecord.id,
    });

    await this.notifyAndHandleRollback(subscription, repo, email);

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
  }: SubscriptionsQueryDto): Promise<SubscriptionWithRepositoryEntity[]> {
    return this.subscriptionRepository.findByEmail(email, true);
  }

  private async validateRepositoryExists(repo: string): Promise<void> {
    const repoExists = await this.repositoryProvider.checkRepoExists(repo);
    if (!repoExists) {
      throw new NotFoundError('Repository not found on GitHub');
    }
  }

  private async notifyAndHandleRollback(
    subscription: SubscriptionEntity,
    repo: string,
    email: string,
  ): Promise<void> {
    try {
      const confirmationUrl = AppUrls.confirm(
        this.appBaseUrl,
        subscription.confirmationToken,
      );
      const unsubscribeUrl = AppUrls.unsubscribe(
        this.appBaseUrl,
        subscription.unsubscribeToken,
      );

      await this.emailService.sendSubscriptionConfirmationEmail(
        email,
        repo,
        confirmationUrl,
        unsubscribeUrl,
      );
    } catch (error) {
      await this.subscriptionRepository.deleteByUnsubscribeToken(
        subscription.unsubscribeToken,
      );
      throw error;
    }
  }
}
