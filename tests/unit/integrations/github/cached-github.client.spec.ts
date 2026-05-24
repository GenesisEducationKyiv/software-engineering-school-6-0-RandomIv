import { CachedGitHubClient } from '../../../../src/integrations/github/cached-github.client';
import { GitHubClient } from '../../../../src/integrations/github/interfaces/github-client.interface';
import { CacheStorage } from '../../../../src/core/cache/interfaces/cache-storage.interface';

describe('CachedGitHubClient', () => {
  let mockBaseClient: jest.Mocked<GitHubClient>;
  let mockCacheStorage: jest.Mocked<CacheStorage>;
  let cachedClient: CachedGitHubClient;

  beforeEach(() => {
    mockBaseClient = { get: jest.fn() } as any;
    mockCacheStorage = { getJson: jest.fn(), setJson: jest.fn() } as any;
    cachedClient = new CachedGitHubClient(mockBaseClient, mockCacheStorage);
  });

  it('should return cached data on cache hit and NOT call base client', async () => {
    mockCacheStorage.getJson.mockResolvedValueOnce({ cached: 'value' });

    const result = await cachedClient.get('owner/repo/releases/latest');

    expect(result).toEqual({ cached: 'value' });
    expect(mockBaseClient.get).not.toHaveBeenCalled();
  });

  it('should call base client and save to cache on cache miss', async () => {
    mockCacheStorage.getJson.mockResolvedValueOnce(null);
    mockBaseClient.get.mockResolvedValueOnce({ fresh: 'data' });

    const result = await cachedClient.get('owner/repo/releases/latest');

    expect(result).toEqual({ fresh: 'data' });
    expect(mockBaseClient.get).toHaveBeenCalledWith('owner/repo/releases/latest');
    expect(mockCacheStorage.setJson).toHaveBeenCalledWith(
      'github:repos:latest-release:owner/repo',
      { fresh: 'data' },
      expect.any(Number),
    );
  });

  it('should ignore cache storage read errors and safely call network', async () => {
    mockCacheStorage.getJson.mockRejectedValueOnce(new Error('Redis dead'));
    mockBaseClient.get.mockResolvedValueOnce({ network: 'data' });

    const result = await cachedClient.get('owner/repo');

    expect(result).toEqual({ network: 'data' });
    expect(mockBaseClient.get).toHaveBeenCalled();
  });
});
