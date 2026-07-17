import { HttpStatus } from '../../common/constants/http-status.constant';
import { AppError, RateLimitError } from '../../common/errors';
import { httpClient } from '../../common/utils/http-client.util';
import { config } from '../../config';
import { GitHubClient } from './interfaces/github-client.interface';

const GITHUB_API_BASE_URL = 'https://api.github.com/repos';

export class HttpGitHubClient implements GitHubClient {
  async get(path: string): Promise<unknown> {
    const normalizedPath = path.replace(/^\/+/, '');

    try {
      return await httpClient<unknown>(
        `${GITHUB_API_BASE_URL}/${normalizedPath}`,
        { headers: this.getHeaders() },
      );
    } catch (error) {
      if (this.isRateLimitError(error)) throw new RateLimitError();
      throw error;
    }
  }

  private getHeaders(): Record<string, string> {
    return config.GITHUB_TOKEN
      ? { Authorization: `Bearer ${config.GITHUB_TOKEN}` }
      : {};
  }

  private isRateLimitError(error: unknown): boolean {
    return (
      error instanceof AppError &&
      error.statusCode === HttpStatus.FORBIDDEN &&
      error.message.toLowerCase().includes('rate limit')
    );
  }
}
