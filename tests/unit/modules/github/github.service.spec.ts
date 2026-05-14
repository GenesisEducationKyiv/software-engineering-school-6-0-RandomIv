import { NotFoundError } from '../../../../src/common/errors';
import { GitHubApiService } from '../../../../src/modules/github/github.service';

describe('github.service', () => {
  const request = jest.fn();
  const service = new GitHubApiService(request);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRepoExists', () => {
    it('returns true when github call succeeds', async () => {
      request.mockResolvedValueOnce({});

      await expect(service.checkRepoExists('owner/repo')).resolves.toBe(true);
      expect(request).toHaveBeenCalledWith('owner/repo');
    });

    it('returns false when github returns not found', async () => {
      request.mockRejectedValueOnce(new NotFoundError());

      await expect(service.checkRepoExists('owner/repo')).resolves.toBe(false);
    });

    it('propagates unexpected errors', async () => {
      const error = new Error('GitHub unavailable');
      request.mockRejectedValueOnce(error);

      await expect(service.checkRepoExists('owner/repo')).rejects.toThrow(
        error,
      );
    });
  });

  describe('getLatestReleaseTag', () => {
    it('returns release tag when response is valid', async () => {
      request.mockResolvedValueOnce({ tag_name: 'v1.2.3' });

      await expect(service.getLatestReleaseTag('owner/repo')).resolves.toBe(
        'v1.2.3',
      );
      expect(request).toHaveBeenCalledWith('owner/repo/releases/latest');
    });

    it('returns null when repository or latest release is not found', async () => {
      request.mockRejectedValueOnce(new NotFoundError());

      await expect(
        service.getLatestReleaseTag('owner/repo'),
      ).resolves.toBeNull();
    });

    it('throws when response does not match schema', async () => {
      request.mockResolvedValueOnce({ invalid: 'shape' });

      await expect(service.getLatestReleaseTag('owner/repo')).rejects.toThrow();
    });

    it('propagates unexpected errors', async () => {
      const error = new Error('Unexpected failure');
      request.mockRejectedValueOnce(error);

      await expect(service.getLatestReleaseTag('owner/repo')).rejects.toThrow(
        error,
      );
    });
  });
});
