import { logger } from '../../core/logger';
import { ReleaseProvider } from '../../integrations/github/github.service';
import { EmailService } from '../../integrations/email/email.service';
import { RepositoryRepository } from '../repository/repository.repository';
import type {
  RepositoryWithSubscriptionsEntity,
  SubscriptionEntity,
} from '../../common/entities';
import { RateLimitError } from '../../common/errors';
import { AppUrls } from '../../common/utils/url-builder.util';
export interface ReleaseScannerDependencies {
  releaseProvider: ReleaseProvider;
  emailService: EmailService;
  repositoryRepository: RepositoryRepository;
  appBaseUrl: string;
}
export class ScannerService {
  private readonly releaseProvider: ReleaseProvider;
  private readonly emailService: EmailService;
  private readonly repositoryRepository: RepositoryRepository;
  private readonly appBaseUrl: string;
  constructor(dependencies: ReleaseScannerDependencies) {
    this.releaseProvider = dependencies.releaseProvider;
    this.emailService = dependencies.emailService;
    this.repositoryRepository = dependencies.repositoryRepository;
    this.appBaseUrl = dependencies.appBaseUrl;
  }
  async checkReleases(): Promise<void> {
    const repositories =
      await this.repositoryRepository.getActiveRepositories();
    for (const repo of repositories) {
      try {
        await this.processRepository(repo);
      } catch (error) {
        if (error instanceof RateLimitError) {
          logger.warn(
            '[Scanner] GitHub API rate limit hit. Pausing scanner until next cron cycle.',
          );
          break;
        }
        logger.error(
          { repository: repo.fullName, err: error },
          '[Scanner] Failed',
        );
      }
    }
  }
  private async processRepository(
    repo: RepositoryWithSubscriptionsEntity,
  ): Promise<void> {
    const latestRelease = await this.releaseProvider.getLatestRelease(
      repo.fullName,
    );
    if (!latestRelease || latestRelease.tag === repo.lastSeenTag) {
      return;
    }
    const allEmailsSent = await this.notifySubscribers(repo, latestRelease);
    if (!allEmailsSent) {
      logger.error(
        `[Scanner] Skipping lastSeenTag update for ${repo.fullName} because one or more emails failed.`,
      );
      return;
    }
    await this.repositoryRepository.updateLastSeenTag(
      repo.id,
      latestRelease.tag,
    );
  }
  private async notifySubscribers(
    repo: RepositoryWithSubscriptionsEntity,
    latestRelease: { tag: string; url: string },
  ): Promise<boolean> {
    let allEmailsSent = true;
    for (const sub of repo.subscriptions) {
      const success = await this.sendEmailToSubscriber(
        repo.fullName,
        sub,
        latestRelease,
      );
      if (!success) {
        allEmailsSent = false;
      }
    }
    return allEmailsSent;
  }
  private async sendEmailToSubscriber(
    repoFullName: string,
    sub: SubscriptionEntity,
    latestRelease: { tag: string; url: string },
  ): Promise<boolean> {
    try {
      const unsubscribeUrl = AppUrls.unsubscribe(
        this.appBaseUrl,
        sub.unsubscribeToken,
      );
      await this.emailService.sendReleaseEmail(
        sub.email,
        repoFullName,
        latestRelease.tag,
        latestRelease.url,
        unsubscribeUrl,
      );
      return true;
    } catch (error) {
      logger.error(
        { email: sub.email, repository: repoFullName, err: error },
        '[Scanner] Failed to notify subscriber',
      );
      return false;
    }
  }
}
