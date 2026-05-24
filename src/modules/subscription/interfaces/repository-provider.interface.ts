export interface RepositoryProvider {
  checkRepoExists(repository: string): Promise<boolean>;
}
