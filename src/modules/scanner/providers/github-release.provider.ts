import type { GitHubService } from '../../../integrations/github/github.service';
import type {
  LatestRelease,
  ReleaseProvider,
} from '../interfaces/release-provider.interface';

export class GithubReleaseProvider implements ReleaseProvider {
  constructor(private readonly githubService: GitHubService) {}

  async getLatestRelease(repository: string): Promise<LatestRelease | null> {
    return this.githubService.getLatestRelease(repository);
  }
}
