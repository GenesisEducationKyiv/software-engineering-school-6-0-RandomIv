import {
  SubscribeDto,
  SubscriptionsQueryDto,
  TokenParamDto,
} from './subscription.schema';
import type { SubscriptionEntity } from './entities/subscription.entity';
import type { SubscriptionWithRepositoryEntity } from './entities/subscription-with-repository.entity';
import type { RepositoryRepository } from '../repository/repository.repository';
import { BadRequestError, NotFoundError } from '../../common/errors';
import type { NotificationPort } from '../../common/interfaces/notification-port.interface';
import type { RepositoryProvider } from './interfaces/repository-provider.interface';
import type { SubscriptionRepositoryInterface } from './interfaces/subscription-repository.interface';
import { AppUrls } from '../../common/utils/url-builder.util';
import { SubscriptionNotificationError } from './subscription.error';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepositoryInterface,
    private readonly repositoryProvider: RepositoryProvider,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly notificationPort: NotificationPort,
    private readonly appBaseUrl: string,
  ) {}

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

      await this.notificationPort.sendConfirmation(
        email,
        repo,
        confirmationUrl,
        unsubscribeUrl,
      );
    } catch {
      await this.subscriptionRepository.deleteByUnsubscribeToken(
        subscription.unsubscribeToken,
      );
      throw new SubscriptionNotificationError();
    }
  }
}
