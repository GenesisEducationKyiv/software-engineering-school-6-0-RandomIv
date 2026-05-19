import { NotFoundError } from '../../common/errors';
import { githubReleaseSchema } from './github.schema';
import { z } from 'zod';

type GitHubRequest = <T>(
  endpoint: string,
  schema?: z.ZodSchema<T>,
) => Promise<T>;

export interface RepositoryProvider {
  checkRepoExists(repository: string): Promise<boolean>;
}

export interface ReleaseProvider {
  getLatestRelease(
    repository: string,
  ): Promise<{ tag: string; url: string } | null>;
}

export class GitHubApiService implements RepositoryProvider, ReleaseProvider {
  constructor(private readonly request: GitHubRequest) {}

  async checkRepoExists(repository: string): Promise<boolean> {
    try {
      await this.request<unknown>(repository);

      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }

      throw error;
    }
  }

  async getLatestRelease(
    repository: string,
  ): Promise<{ tag: string; url: string } | null> {
    try {
      const data = await this.request(
        `${repository}/releases/latest`,
        githubReleaseSchema,
      );

      return {
        tag: data.tag_name,
        url: data.html_url,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }
}
