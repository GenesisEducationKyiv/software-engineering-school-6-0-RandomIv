import type { GitHubService } from '../../../integrations/github/github.service';
import type { RepositoryProvider } from '../interfaces/repository-provider.interface';

export class GithubRepositoryProvider implements RepositoryProvider {
  constructor(private readonly githubService: GitHubService) {}

  async checkRepoExists(repository: string): Promise<boolean> {
    return this.githubService.checkRepoExists(repository);
  }
}
