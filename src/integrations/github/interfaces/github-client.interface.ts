export interface GitHubClient {
  get(path: string): Promise<unknown>;
}
