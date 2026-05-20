import { GitHubClientPort } from '../../src/application/ports/github.client.port';

export interface FakeGitHubState {
  exists?: boolean;
  latestTag?: string | null;
}

export class FakeGitHubClient implements GitHubClientPort {
  public state: FakeGitHubState;
  constructor(state: FakeGitHubState = {}) {
    this.state = state;
  }
  async repoExists(_full: string): Promise<boolean> {
    return this.state.exists ?? true;
  }
  async getLatestReleaseTag(_full: string): Promise<string | null> {
    return this.state.latestTag ?? null;
  }
}
