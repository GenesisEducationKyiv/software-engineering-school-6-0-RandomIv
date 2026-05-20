import { GitHubClientPort } from '../../src/application/ports/github.client.port';

export class FakeGitHubClient implements GitHubClientPort {
  constructor(
    private readonly state: { exists?: boolean; latestTag?: string | null } = {},
  ) {}
  async repoExists(_full: string): Promise<boolean> {
    return this.state.exists ?? true;
  }
  async getLatestReleaseTag(_full: string): Promise<string | null> {
    return this.state.latestTag ?? null;
  }
}
