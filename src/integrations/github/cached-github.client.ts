import { config } from '../../config';
import { logger } from '../../core/logger';
import { GitHubClient } from './interfaces/github-client.interface';
import { CacheStorage } from '../../core/cache/interfaces/cache-storage.interface';

const GITHUB_CACHE_KEY_PREFIX = 'github:repos';
const LATEST_RELEASE_SUFFIX = '/releases/latest';

export class CachedGitHubClient implements GitHubClient {
  constructor(
    private readonly baseClient: GitHubClient,
    private readonly cacheStorage: CacheStorage,
  ) {}

  async get(path: string): Promise<unknown> {
    const normalizedPath = path.replace(/^\/+/, '');
    const cacheKey = this.getCacheKey(normalizedPath);

    if (cacheKey) {
      try {
        const cached = await this.cacheStorage.getJson<unknown>(cacheKey);
        if (cached !== null) return cached;
      } catch (err) {
        logger.error({ cacheKey, err }, '[Github Cache] Read failed');
      }
    }

    const result = await this.baseClient.get(normalizedPath);

    if (cacheKey) {
      try {
        await this.cacheStorage.setJson(
          cacheKey,
          result,
          config.GITHUB_CACHE_TTL_SECONDS,
        );
      } catch (err) {
        logger.error({ cacheKey, err }, '[Github Cache] Write failed');
      }
    }

    return result;
  }

  private getCacheKey(normalizedPath: string): string | undefined {
    if (normalizedPath.endsWith(LATEST_RELEASE_SUFFIX)) {
      const repository = normalizedPath.slice(0, -LATEST_RELEASE_SUFFIX.length);
      if (!repository) return undefined;
      return `${GITHUB_CACHE_KEY_PREFIX}:latest-release:${repository}`;
    }
    return `${GITHUB_CACHE_KEY_PREFIX}:repo-info:${normalizedPath}`;
  }
}
