import { logger } from '../../core/logger/logger';
import { GitHubService } from '../../integrations/github/github.service';
import { EmailService } from '../../integrations/email/email.service';
import { RepositoryRepository } from '../repository/repository.repository';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';
import { RateLimitError } from '../../common/errors';

interface ScannerServiceDependencies {
  githubService: Pick<GitHubService, 'getLatestReleaseTag'>;
  emailService: Pick<EmailService, 'sendReleaseEmail'>;
  repositoryService: Pick<
    RepositoryRepository,
    'getActiveRepositories' | 'updateLastSeenTag'
  >;
}

export interface ScannerService {
  checkReleases(): Promise<void>;
}

export class ReleaseScannerService implements ScannerService {
  private readonly githubService: Pick<GitHubService, 'getLatestReleaseTag'>;
  private readonly emailService: Pick<EmailService, 'sendReleaseEmail'>;
  private readonly repositoryService: Pick<
    RepositoryRepository,
    'getActiveRepositories' | 'updateLastSeenTag'
  >;

  constructor(dependencies: ScannerServiceDependencies) {
    this.githubService = dependencies.githubService;
    this.emailService = dependencies.emailService;
    this.repositoryService = dependencies.repositoryService;
  }

  async checkReleases(): Promise<void> {
    const repositories: RepositoryWithSubscriptions[] =
      await this.repositoryService.getActiveRepositories();

    for (const repo of repositories) {
      try {
        const latestTag = await this.githubService.getLatestReleaseTag(
          repo.fullName,
        );
        if (!latestTag || latestTag === repo.lastSeenTag) continue;

        let allEmailsSent = true;

        for (const sub of repo.subscriptions) {
          try {
            await this.emailService.sendReleaseEmail(
              sub.email,
              repo.fullName,
              latestTag,
              sub.unsubscribeToken,
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

        await this.repositoryService.updateLastSeenTag(repo.id, latestTag);
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
