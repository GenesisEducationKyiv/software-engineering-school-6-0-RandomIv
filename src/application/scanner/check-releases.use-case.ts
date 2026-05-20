import { GitHubClientPort } from '../ports/github.client.port';
import { LoggerPort } from '../ports/logger.port';
import { RepositoryRepositoryPort } from '../ports/repository.repository.port';
import { NotifyRepositorySubscribersUseCase } from './notify-repository-subscribers.use-case';
import { RateLimitError } from '../../domain/errors';

export class CheckReleasesUseCase {
  constructor(
    private readonly repositories: RepositoryRepositoryPort,
    private readonly github: GitHubClientPort,
    private readonly notify: NotifyRepositorySubscribersUseCase,
    private readonly logger: LoggerPort,
  ) {}

  async execute(): Promise<void> {
    const repositories = await this.repositories.listActiveWithSubscribers();

    for (const repo of repositories) {
      try {
        const latestTag = await this.github.getLatestReleaseTag(repo.fullName);
        if (!latestTag || latestTag === repo.lastSeenTag) continue;

        const allOk = await this.notify.execute({
          repository: repo.fullName,
          version: latestTag,
          subscribers: repo.subscriptions.map(s => ({
            email: s.email, unsubscribeToken: s.unsubscribeToken,
          })),
        });

        if (!allOk) {
          this.logger.error(
            `[Scanner] Skipping lastSeenTag update for ${repo.fullName}: some emails failed`,
          );
          continue;
        }

        await this.repositories.updateLastSeenTag(repo.id, latestTag);
      } catch (error) {
        if (error instanceof RateLimitError) {
          this.logger.warn('[Scanner] GitHub rate limit hit. Pausing until next cycle.');
          break;
        }
        this.logger.error({ repository: repo.fullName, err: error }, '[Scanner] Failed');
      }
    }
  }
}
