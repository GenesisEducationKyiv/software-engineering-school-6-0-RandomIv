import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError, RateLimitError } from '../../common/errors';
import { cacheService } from '../../common/cache/cache.service';
import { httpClient } from '../../common/utils/http-client';
import { config } from '../../config';
import { getGitHubCacheKey } from './github.cache-keys';

const GITHUB_API_BASE_URL = 'https://api.github.com/repos';

const getGitHubHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};

  if (config.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${config.GITHUB_TOKEN}`;
  }

  return headers;
};

const isGitHubRateLimitError = (error: unknown): boolean => {
  if (!(error instanceof AppError)) {
    return false;
  }

  if (error.statusCode !== HttpStatus.FORBIDDEN) {
    return false;
  }

  return error.message.toLowerCase().includes('rate limit');
};

export const githubHttpClient = async <T>(path: string): Promise<T> => {
  const normalizedPath = path.replace(/^\/+/, '');
  const cacheKey = getGitHubCacheKey(normalizedPath);

  try {
    if (cacheKey) {
      try {
        const cachedResponse = await cacheService.getJson<T>(cacheKey);
        if (cachedResponse !== null) {
          return cachedResponse;
        }
      } catch (cacheError) {
        console.error(`[GitHub] Failed to read cache for ${cacheKey}:`, cacheError);
      }
    }

    const response = await httpClient<T>(
      `${GITHUB_API_BASE_URL}/${normalizedPath}`,
      {
        headers: getGitHubHeaders(),
      },
    );

    if (cacheKey) {
      try {
        await cacheService.setJson(
          cacheKey,
          response,
          config.GITHUB_CACHE_TTL_SECONDS,
        );
      } catch (cacheError) {
        console.error(
          `[GitHub] Failed to write cache for ${cacheKey}:`,
          cacheError,
        );
      }
    }

    return response;
  } catch (error) {
    if (isGitHubRateLimitError(error)) {
      throw new RateLimitError();
    }

    throw error;
  }
};
