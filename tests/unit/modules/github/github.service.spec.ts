import { NotFoundError } from '../../../../src/common/errors';

jest.mock('../../../../src/modules/github/github.utils', () => ({
  githubHttpClient: jest.fn(),
}));

import { githubHttpClient } from '../../../../src/modules/github/github.utils';
import {
  checkRepoExists,
  getLatestReleaseTag,
} from '../../../../src/modules/github/github.service';

const mockedGithubHttpClient = jest.mocked(githubHttpClient);

describe('github.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRepoExists', () => {
    it('returns true when github call succeeds', async () => {
      mockedGithubHttpClient.mockResolvedValueOnce({} as never);

      await expect(checkRepoExists('owner/repo')).resolves.toBe(true);
      expect(mockedGithubHttpClient).toHaveBeenCalledWith('owner/repo');
    });

    it('returns false when github returns not found', async () => {
      mockedGithubHttpClient.mockRejectedValueOnce(new NotFoundError());

      await expect(checkRepoExists('owner/repo')).resolves.toBe(false);
    });

    it('propagates unexpected errors', async () => {
      const error = new Error('GitHub unavailable');
      mockedGithubHttpClient.mockRejectedValueOnce(error);

      await expect(checkRepoExists('owner/repo')).rejects.toThrow(error);
    });
  });

  describe('getLatestReleaseTag', () => {
    it('returns release tag when response is valid', async () => {
      mockedGithubHttpClient.mockResolvedValueOnce({ tag_name: 'v1.2.3' } as never);

      await expect(getLatestReleaseTag('owner/repo')).resolves.toBe('v1.2.3');
      expect(mockedGithubHttpClient).toHaveBeenCalledWith(
        'owner/repo/releases/latest',
      );
    });

    it('returns null when repository or latest release is not found', async () => {
      mockedGithubHttpClient.mockRejectedValueOnce(new NotFoundError());

      await expect(getLatestReleaseTag('owner/repo')).resolves.toBeNull();
    });

    it('throws when response does not match schema', async () => {
      mockedGithubHttpClient.mockResolvedValueOnce({ invalid: 'shape' } as never);

      await expect(getLatestReleaseTag('owner/repo')).rejects.toThrow();
    });

    it('propagates unexpected errors', async () => {
      const error = new Error('Unexpected failure');
      mockedGithubHttpClient.mockRejectedValueOnce(error);

      await expect(getLatestReleaseTag('owner/repo')).rejects.toThrow(error);
    });
  });
});
