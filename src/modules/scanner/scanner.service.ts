import { getLatestReleaseTag } from '../github/github.service';
import { sendReleaseEmail } from '../notification/email.service';
import {
  getActiveRepositories,
  updateLastSeenTag,
} from '../repository/repository.service';
import { RepositoryWithSubscriptions } from '../../common/types/repository-with-subscriptions.type';
import { RateLimitError } from '../../common/errors';

export const checkReleases = async () => {
  const repositories: RepositoryWithSubscriptions[] =
    await getActiveRepositories();

  for (const repo of repositories) {
    try {
      const latestTag = await getLatestReleaseTag(repo.fullName);
      if (!latestTag || latestTag === repo.lastSeenTag) continue;

      let allEmailsSent = true;

      for (const sub of repo.subscriptions) {
        try {
          await sendReleaseEmail(
            sub.email,
            repo.fullName,
            latestTag,
            sub.unsubscribeToken,
          );
        } catch (error) {
          allEmailsSent = false;
          console.error(
            `[Scanner] Failed to notify ${sub.email} for ${repo.fullName}:`,
            error,
          );
        }
      }

      if (!allEmailsSent) {
        console.error(
          `[Scanner] Skipping lastSeenTag update for ${repo.fullName} because one or more emails failed.`,
        );
        continue;
      }

      await updateLastSeenTag(repo.id, latestTag);
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.warn(
          '[Scanner] GitHub API rate limit hit. Pausing scanner until next cron cycle.',
        );
        break;
      }

      console.error(`[Scanner] Failed for ${repo.fullName}:`, error);
    }
  }
};
