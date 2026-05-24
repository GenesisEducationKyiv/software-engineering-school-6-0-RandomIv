import { NotFoundError } from '../../../../src/common/errors';
import { GitHubService } from '../../../../src/integrations/github/github.service';
import { type GitHubReleaseResponse } from '../../../../src/integrations/github/github.schema';

describe('github.service', () => {
  const request = jest.fn();
  const service = new GitHubService({ get: request } as any);

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

  describe('getLatestRelease', () => {
    it('returns release payload when response is valid', async () => {
      request.mockImplementationOnce(
        (_endpoint) =>
          ({
            tag_name: 'v1.2.3',
            html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
          }) as GitHubReleaseResponse,
      );

      await expect(service.getLatestRelease('owner/repo')).resolves.toEqual({
        tag: 'v1.2.3',
        url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
      });
      expect(request).toHaveBeenCalledWith('owner/repo/releases/latest');
    });

    it('returns null when repository or latest release is not found', async () => {
      request.mockRejectedValueOnce(new NotFoundError());

      await expect(service.getLatestRelease('owner/repo')).resolves.toBeNull();
    });

    it('throws when response does not match schema', async () => {
      request.mockImplementationOnce(
        (_endpoint) => ({ invalid: 'shape' }) as any,
      );

      await expect(service.getLatestRelease('owner/repo')).rejects.toThrow();
    });

    it('propagates unexpected errors', async () => {
      const error = new Error('Unexpected failure');
      request.mockRejectedValueOnce(error);

      await expect(service.getLatestRelease('owner/repo')).rejects.toThrow(
        error,
      );
    });
  });
});
