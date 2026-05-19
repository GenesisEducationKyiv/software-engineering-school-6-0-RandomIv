import { NotFoundError } from '../../common/errors';
import { GitHubReleaseResponse, githubReleaseSchema } from './github.schema';

type GitHubRequest = <T>(endpoint: string) => Promise<T>;

export interface GitHubService {
  checkRepoExists(repository: string): Promise<boolean>;
  getLatestRelease(
    repository: string,
  ): Promise<{ tag: string; url: string } | null>;
}

export class GitHubApiService implements GitHubService {
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
      const data = await this.request<GitHubReleaseResponse>(
        `${repository}/releases/latest`,
      );

      const parsedData = githubReleaseSchema.parse(data);
      return {
        tag: parsedData.tag_name,
        url: parsedData.html_url,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }
}
