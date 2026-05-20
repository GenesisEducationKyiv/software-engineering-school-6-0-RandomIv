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

  it('omits Authorization header when token is missing', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await client.repoExists('a/b');
    expect(http.request).toHaveBeenCalledWith(
      'https://api.github.com/repos/a/b',
      { headers: {} },
    );
  });

  it('sends Authorization header when token is set', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    const client = new GitHubHttpClient(http, cache, silentLogger, {
      cacheTtlSeconds: 60,
      token: 'ghp_test_token',
    });
    await client.repoExists('a/b');
    expect(http.request).toHaveBeenCalledWith(
      'https://api.github.com/repos/a/b',
      { headers: { Authorization: 'Bearer ghp_test_token' } },
    );
  });

  it('rethrows non-rate-limit AppError on FORBIDDEN', async () => {
    const error = new AppError(HttpStatus.FORBIDDEN, 'Forbidden');
    (http.request as jest.Mock).mockRejectedValue(error);
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).rejects.toBe(error);
  });

  it('rethrows AppError with non-FORBIDDEN status even when message mentions rate limit', async () => {
    const error = new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'rate limit exceeded',
    );
    (http.request as jest.Mock).mockRejectedValue(error);
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('a/b')).rejects.toBe(error);
  });

  it('getLatestReleaseTag throws when response does not match schema', async () => {
    (http.request as jest.Mock).mockResolvedValue({ invalid: 'shape' });
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.getLatestReleaseTag('a/b')).rejects.toThrow();
  });

  it('continues to HTTP call when cache read fails', async () => {
    (cache.getJson as jest.Mock).mockRejectedValue(new Error('Redis read failed'));
    (http.request as jest.Mock).mockResolvedValue({ tag_name: 'v3' });
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.getLatestReleaseTag('a/b')).resolves.toBe('v3');
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  it('returns response when cache write fails', async () => {
    (cache.setJson as jest.Mock).mockRejectedValue(new Error('Redis write failed'));
    (http.request as jest.Mock).mockResolvedValue({ tag_name: 'v4' });
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.getLatestReleaseTag('a/b')).resolves.toBe('v4');
  });

  it('writes successful release response to cache with configured TTL', async () => {
    (http.request as jest.Mock).mockResolvedValue({ tag_name: 'v5' });
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 600 });
    await client.getLatestReleaseTag('a/b');
    expect(cache.setJson).toHaveBeenCalledWith(
      'github:repos:latest-release:a/b',
      { tag_name: 'v5' },
      600,
    );
  });

  it('returns false from repoExists on direct NotFoundError (covers checkRepoExists behavior)', async () => {
    (http.request as jest.Mock).mockRejectedValue(new NotFoundError());
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.repoExists('owner/repo')).resolves.toBe(false);
  });

  it('returns null from getLatestReleaseTag on NotFoundError', async () => {
    (http.request as jest.Mock).mockRejectedValue(new NotFoundError());
    const client = new GitHubHttpClient(http, cache, silentLogger, { cacheTtlSeconds: 60 });
    await expect(client.getLatestReleaseTag('owner/repo')).resolves.toBeNull();
  });
});
