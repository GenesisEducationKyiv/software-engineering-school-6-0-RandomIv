import { HttpStatus } from '../../../../src/common/constants/http-status.constants';

const mockHttpClient = jest.fn();
const mockGetJson = jest.fn();
const mockSetJson = jest.fn();

type LoadGithubHttpClientOptions = {
  token?: string;
  cacheTtl?: number;
};

const loadGithubHttpClient = async ({
  token,
  cacheTtl = 600,
}: LoadGithubHttpClientOptions = {}) => {
  jest.resetModules();

  jest.doMock('../../../../src/common/utils/http-client.util', () => ({
    httpClient: mockHttpClient,
  }));

  jest.doMock('../../../../src/core/cache/cache.service', () => ({
    cacheService: {
      getJson: mockGetJson,
      setJson: mockSetJson,
    },
  }));

  jest.doMock('../../../../src/config', () => ({
    config: {
      GITHUB_TOKEN: token,
      GITHUB_CACHE_TTL_SECONDS: cacheTtl,
    },
  }));

  return import('../../../../src/integrations/github/github.http-client');
};

describe('github.http-client', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockHttpClient.mockReset();
    mockGetJson.mockReset();
    mockSetJson.mockReset();
    mockGetJson.mockResolvedValue(null);
    mockSetJson.mockResolvedValue(undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('calls httpClient with normalized path and empty headers when token is missing', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    mockHttpClient.mockResolvedValueOnce({ ok: true });

    await githubHttpClient('owner/repo');

    expect(mockHttpClient).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo',
      {
        headers: {},
      },
    );
  });

  it('removes leading slash from path', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    mockHttpClient.mockResolvedValueOnce({ ok: true });

    await githubHttpClient('/owner/repo');

    expect(mockHttpClient).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo',
      {
        headers: {},
      },
    );
  });

  it('adds authorization header when token exists', async () => {
    const { githubHttpClient } = await loadGithubHttpClient({
      token: 'ghp_test_token',
    });
    mockHttpClient.mockResolvedValueOnce({ ok: true });

    await githubHttpClient('owner/repo');

    expect(mockHttpClient).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo',
      {
        headers: {
          Authorization: 'Bearer ghp_test_token',
        },
      },
    );
  });

  it('maps GitHub rate limit AppError to RateLimitError', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    const { AppError } = await import('../../../../src/common/errors');
    mockHttpClient.mockRejectedValueOnce(
      new AppError(HttpStatus.FORBIDDEN, 'API rate limit exceeded'),
    );

    await expect(githubHttpClient('owner/repo')).rejects.toMatchObject({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too Many Requests from GitHub API',
    });
  });

  it('rethrows non-rate-limit forbidden AppError', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    const { AppError } = await import('../../../../src/common/errors');
    const error = new AppError(HttpStatus.FORBIDDEN, 'Forbidden');
    mockHttpClient.mockRejectedValueOnce(error);

    await expect(githubHttpClient('owner/repo')).rejects.toBe(error);
  });

  it('rethrows AppError with non-forbidden status even if message contains rate limit', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    const { AppError } = await import('../../../../src/common/errors');
    const error = new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'rate limit exceeded',
    );
    mockHttpClient.mockRejectedValueOnce(error);

    await expect(githubHttpClient('owner/repo')).rejects.toBe(error);
  });

  it('rethrows non-AppError values', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    const error = new Error('Network failure');
    mockHttpClient.mockRejectedValueOnce(error);

    await expect(githubHttpClient('owner/repo')).rejects.toBe(error);
  });

  it('uses cached response when present', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    mockGetJson.mockResolvedValueOnce({ tag_name: 'v1.0.0' });

    const result = await githubHttpClient<{ tag_name: string }>(
      'owner/repo/releases/latest',
    );

    expect(result).toEqual({ tag_name: 'v1.0.0' });
    expect(mockHttpClient).not.toHaveBeenCalled();
    expect(mockSetJson).not.toHaveBeenCalled();
    expect(mockGetJson).toHaveBeenCalledWith(
      'github:repos:latest-release:owner/repo',
    );
  });

  it('stores successful github response with configured ttl', async () => {
    const { githubHttpClient } = await loadGithubHttpClient({
      cacheTtl: 600,
    });
    mockHttpClient.mockResolvedValueOnce({ tag_name: 'v2.0.0' });

    const result = await githubHttpClient<{ tag_name: string }>(
      'owner/repo/releases/latest',
    );

    expect(result).toEqual({ tag_name: 'v2.0.0' });
    expect(mockSetJson).toHaveBeenCalledWith(
      'github:repos:latest-release:owner/repo',
      { tag_name: 'v2.0.0' },
      600,
    );
  });

  it('continues with http call when cache read fails', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    mockGetJson.mockRejectedValueOnce(new Error('Redis read failed'));
    mockHttpClient.mockResolvedValueOnce({ ok: true });

    await expect(githubHttpClient('owner/repo')).resolves.toEqual({ ok: true });
    expect(mockHttpClient).toHaveBeenCalledTimes(1);
  });

  it('returns response when cache write fails', async () => {
    const { githubHttpClient } = await loadGithubHttpClient();
    mockHttpClient.mockResolvedValueOnce({ ok: true });
    mockSetJson.mockRejectedValueOnce(new Error('Redis write failed'));

    await expect(githubHttpClient('owner/repo')).resolves.toEqual({ ok: true });
  });
});
