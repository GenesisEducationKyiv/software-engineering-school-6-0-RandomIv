import { NotFoundError } from '../../common/errors';
import { GitHubReleaseResponse, githubReleaseSchema } from './github.schema';

type GitHubRequest = <T>(endpoint: string) => Promise<T>;

export interface GitHubService {
  checkRepoExists(repository: string): Promise<boolean>;
  getLatestReleaseTag(repository: string): Promise<string | null>;
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

  async getLatestReleaseTag(repository: string): Promise<string | null> {
    try {
      const data = await this.request<GitHubReleaseResponse>(
        `${repository}/releases/latest`,
      );

      const parsedData = githubReleaseSchema.parse(data);
      return parsedData.tag_name;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }
}
