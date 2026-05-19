const GITHUB_CACHE_KEY_PREFIX = 'github:repos';
const LATEST_RELEASE_SUFFIX = '/releases/latest';

export const githubRepoInfoCacheKey = (repository: string): string => {
  return `${GITHUB_CACHE_KEY_PREFIX}:repo-info:${repository}`;
};

export const githubLatestReleaseCacheKey = (repository: string): string => {
  return `${GITHUB_CACHE_KEY_PREFIX}:latest-release:${repository}`;
};

export const getGitHubCacheKey = (
  normalizedPath: string,
): string | undefined => {
  if (normalizedPath.endsWith(LATEST_RELEASE_SUFFIX)) {
    const repository = normalizedPath.slice(0, -LATEST_RELEASE_SUFFIX.length);
    if (!repository) {
      return undefined;
    }

    return githubLatestReleaseCacheKey(repository);
  }

  return githubRepoInfoCacheKey(normalizedPath);
};
