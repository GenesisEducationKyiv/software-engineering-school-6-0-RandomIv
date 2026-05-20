import { GitHubHttpClient } from '../../../../src/infrastructure/github/github-http.client';
import { CachePort } from '../../../../src/application/ports/cache.port';
import { HttpClientPort } from '../../../../src/application/ports/http-client.port';
import { LoggerPort } from '../../../../src/application/ports/logger.port';
import { NotFoundError, RateLimitError, AppError } from '../../../../src/domain/errors';
import { HttpStatus } from '../../../../src/common/constants/http-status.constants';

const silentLogger: LoggerPort = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('GitHubHttpClient', () => {
  let cache: CachePort;
  let http: HttpClientPort;
  beforeEach(() => {
    cache = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn().mockResolvedValue(undefined) };
    http = { request: jest.fn() };
  });

  it('repoExists returns true on 200', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).resolves.toBe(true);
  });

  it('repoExists returns false on NotFoundError', async () => {
    (http.request as jest.Mock).mockRejectedValue(new NotFoundError());
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).resolves.toBe(false);
  });

  it('maps 403 "rate limit" AppError to RateLimitError', async () => {
    (http.request as jest.Mock).mockRejectedValue(
      new AppError(HttpStatus.FORBIDDEN, 'API rate limit exceeded for ...'),
    );
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('returns cached value when present', async () => {
    (cache.getJson as jest.Mock).mockResolvedValue({ tag_name: 'v1' });
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.getLatestReleaseTag('a/b')).resolves.toBe('v1');
    expect(http.request).not.toHaveBeenCalled();
  });
});
