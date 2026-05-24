export interface LatestRelease {
  tag: string;
  url: string;
}

export interface ReleaseProvider {
  getLatestRelease(repository: string): Promise<LatestRelease | null>;
}
