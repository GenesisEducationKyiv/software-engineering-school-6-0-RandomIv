export interface GitHubClientPort {
  repoExists(fullName: string): Promise<boolean>;
  getLatestReleaseTag(fullName: string): Promise<string | null>;
}
