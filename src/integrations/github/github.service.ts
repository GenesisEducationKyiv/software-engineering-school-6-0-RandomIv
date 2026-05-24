import { NotFoundError } from '../../common/errors';
import { githubReleaseSchema } from './github.schema';
import { GitHubClient } from './interfaces/github-client.interface';
import { GitHubRelease } from './interfaces/github-release.interface';

export class GitHubService {
  constructor(private readonly client: GitHubClient) {}

  async checkRepoExists(repository: string): Promise<boolean> {
    try {
      await this.client.get(repository);
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) return false;
      throw error;
    }
  }

  async getLatestRelease(repository: string): Promise<GitHubRelease | null> {
    try {
      const rawData = await this.client.get(`${repository}/releases/latest`);

      const parsedData = githubReleaseSchema.parse(rawData);

      return {
        tag: parsedData.tag_name,
        url: parsedData.html_url,
      };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }
}
