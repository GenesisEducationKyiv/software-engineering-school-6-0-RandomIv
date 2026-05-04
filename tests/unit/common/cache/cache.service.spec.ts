jest.mock('../../../../src/common/cache/redis.client', () => ({
  getRedisClient: jest.fn(),
}));

import { cacheService } from '../../../../src/common/cache/cache.service';
import { getRedisClient } from '../../../../src/common/cache/redis.client';

const mockedGetRedisClient = jest.mocked(getRedisClient);

describe('cache.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when redis client is unavailable', async () => {
    mockedGetRedisClient.mockResolvedValueOnce(null);

    await expect(cacheService.getJson('any:key')).resolves.toBeNull();
  });

  it('returns parsed json value from redis', async () => {
    const redisClient = {
      get: jest.fn().mockResolvedValueOnce(JSON.stringify({ ok: true })),
    };
    mockedGetRedisClient.mockResolvedValueOnce(redisClient as never);

    await expect(
      cacheService.getJson<{ ok: boolean }>('any:key'),
    ).resolves.toEqual({ ok: true });
    expect(redisClient.get).toHaveBeenCalledWith('any:key');
  });

  it('writes json value with ttl', async () => {
    const redisClient = {
      setEx: jest.fn().mockResolvedValueOnce('OK'),
    };
    mockedGetRedisClient.mockResolvedValueOnce(redisClient as never);

    await cacheService.setJson('any:key', { ok: true }, 600);

    expect(redisClient.setEx).toHaveBeenCalledWith(
      'any:key',
      600,
      JSON.stringify({ ok: true }),
    );
  });

  it('does nothing on write when redis client is unavailable', async () => {
    mockedGetRedisClient.mockResolvedValueOnce(null);

    await expect(
      cacheService.setJson('any:key', { ok: true }, 600),
    ).resolves.toBeUndefined();
  });
});
