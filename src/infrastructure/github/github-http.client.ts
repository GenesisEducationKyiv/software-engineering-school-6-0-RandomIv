import { GitHubClientPort } from '../../application/ports/github.client.port';
import { CachePort } from '../../application/ports/cache.port';
import { HttpClientPort } from '../../application/ports/http-client.port';
import { LoggerPort } from '../../application/ports/logger.port';
import { AppError, NotFoundError, RateLimitError } from '../../domain/errors';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { githubReleaseSchema, GitHubReleaseResponse } from '../../modules/github/github.schema';
import { getGitHubCacheKey } from './github-cache-keys';

const GITHUB_API_BASE_URL = 'https://api.github.com/repos';

interface GitHubHttpClientConfig {
  token?: string;
  cacheTtlSeconds: number;
}

const isGitHubRateLimitError = (error: unknown): boolean =>
  error instanceof AppError &&
  error.statusCode === HttpStatus.FORBIDDEN &&
  error.message.toLowerCase().includes('rate limit');

export class GitHubHttpClient implements GitHubClientPort {
  constructor(
    private readonly http: HttpClientPort,
    private readonly cache: CachePort,
    private readonly logger: LoggerPort,
    private readonly config: GitHubHttpClientConfig,
  ) {}

  async repoExists(repository: string): Promise<boolean> {
    try {
      await this.fetchWithCache<unknown>(repository);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
  }

  async getLatestReleaseTag(repository: string): Promise<string | null> {
    try {
      const data = await this.fetchWithCache<GitHubReleaseResponse>(
        `${repository}/releases/latest`,
      );
      return githubReleaseSchema.parse(data).tag_name;
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  private headers(): Record<string, string> {
    return this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {};
  }

  private async fetchWithCache<T>(path: string): Promise<T> {
    const normalizedPath = path.replace(/^\/+/, '');
    const cacheKey = getGitHubCacheKey(normalizedPath);

    try {
      if (cacheKey) {
        try {
          const cached = await this.cache.getJson<T>(cacheKey);
          if (cached !== null) return cached;
        } catch (cacheError) {
          this.logger.error({ cacheKey, err: cacheError }, '[GitHub] Failed to read cache');
        }
      }

      const response = await this.http.request<T>(
        `${GITHUB_API_BASE_URL}/${normalizedPath}`,
        { headers: this.headers() },
      );

      if (cacheKey) {
        try {
          await this.cache.setJson(cacheKey, response, this.config.cacheTtlSeconds);
        } catch (cacheError) {
          this.logger.error({ cacheKey, err: cacheError }, '[GitHub] Failed to write cache');
        }
      }

      return response;
    } catch (error) {
      if (isGitHubRateLimitError(error)) throw new RateLimitError();
      throw error;
    }
  }
}
