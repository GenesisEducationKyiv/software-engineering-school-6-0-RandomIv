import {
  SubscribeDto,
  SubscriptionsQueryDto,
  TokenParamDto,
} from './subscription.schema';
import type { SubscriptionEntity } from './entities/subscription.entity';
import type { SubscriptionWithRepositoryEntity } from './entities/subscription-with-repository.entity';
import type { RepositoryRepository } from '../repository/repository.repository';
import { BadRequestError, NotFoundError } from '../../common/errors';
import type { RepositoryProvider } from './interfaces/repository-provider.interface';
import type { SubscriptionRepositoryInterface } from './interfaces/subscription-repository.interface';
import type { ConfirmationPort } from '../../common/interfaces/confirmation-port.interface';
import { AppUrls } from '../../common/utils/url-builder.util';

export class SubscriptionService {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepositoryInterface,
    private readonly repositoryProvider: RepositoryProvider,
    private readonly repositoryRepository: RepositoryRepository,
    private readonly notificationPort: ConfirmationPort,
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

    const confirmationUrl = AppUrls.confirm(
      this.appBaseUrl,
      subscription.confirmationToken,
    );
    const unsubscribeUrl = AppUrls.unsubscribe(
      this.appBaseUrl,
      subscription.unsubscribeToken,
    );

    try {
      await this.notificationPort.sendConfirmation(
        subscription.id,
        email,
        repo,
        confirmationUrl,
        unsubscribeUrl,
      );
    } catch (error) {
      await this.subscriptionRepository.deleteById(subscription.id);
      throw error;
    }

    return subscription;
  }

  async confirmSubscription({ token }: TokenParamDto): Promise<void> {
    const count = await this.subscriptionRepository.confirmByToken(token);
    if (count > 0) return;

    const existing =
      await this.subscriptionRepository.findByConfirmationToken(token);
    if (!existing) {
      throw new NotFoundError('Token not found');
    }
    throw new BadRequestError('Token already used');
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
}
