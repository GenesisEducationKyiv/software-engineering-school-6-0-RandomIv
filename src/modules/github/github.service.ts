import { NotFoundError } from '../../common/errors';
import { GitHubReleaseResponse, githubReleaseSchema } from './github.schema';
import { githubHttpClient } from './github.utils';

export const checkRepoExists = async (repository: string): Promise<boolean> => {
  try {
    await githubHttpClient<unknown>(repository);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return false;
    }

    throw error;
  }
};

export const getLatestReleaseTag = async (
  repository: string,
): Promise<string | null> => {
  try {
    const data = await githubHttpClient<GitHubReleaseResponse>(
      `${repository}/releases/latest`,
    );

    const parsedData = githubReleaseSchema.parse(data);
    return parsedData.tag_name;
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }

    throw error;
  }
};
