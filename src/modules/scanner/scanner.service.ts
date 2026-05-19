import { logger } from '../../core/logger';
import { ReleaseProvider } from '../../integrations/github/github.service';
import { EmailService } from '../../integrations/email/email.service';
import { RepositoryRepository } from '../repository/repository.repository';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';
import { RateLimitError } from '../../common/errors';
import { AppUrls } from '../../common/utils/url-builder.util';

export interface ReleaseScannerDependencies {
  releaseProvider: ReleaseProvider;
  emailService: EmailService;
  repositoryRepository: RepositoryRepository;
  appBaseUrl: string;
}

export interface ScannerService {
  checkReleases(): Promise<void>;
}

export class ReleaseScannerService implements ScannerService {
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
    const repositories: RepositoryWithSubscriptions[] =
      await this.repositoryRepository.getActiveRepositories();

    for (const repo of repositories) {
      try {
        const latestRelease = await this.releaseProvider.getLatestRelease(
          repo.fullName,
        );
        if (!latestRelease || latestRelease.tag === repo.lastSeenTag) continue;

        let allEmailsSent = true;

        for (const sub of repo.subscriptions) {
          try {
            const unsubscribeUrl = AppUrls.unsubscribe(
              this.appBaseUrl,
              sub.unsubscribeToken,
            );

            await this.emailService.sendReleaseEmail(
              sub.email,
              repo.fullName,
              latestRelease.tag,
              latestRelease.url,
              unsubscribeUrl,
            );
          } catch (error) {
            allEmailsSent = false;
            logger.error(
              { email: sub.email, repository: repo.fullName, err: error },
              '[Scanner] Failed to notify subscriber',
            );
          }
        }

        if (!allEmailsSent) {
          logger.error(
            `[Scanner] Skipping lastSeenTag update for ${repo.fullName} because one or more emails failed.`,
          );
          continue;
        }

        await this.repositoryRepository.updateLastSeenTag(
          repo.id,
          latestRelease.tag,
        );
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
}
