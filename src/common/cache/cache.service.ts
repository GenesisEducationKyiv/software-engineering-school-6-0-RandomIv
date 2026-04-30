import { getRedisClient } from './redis.client';
import { nullCache } from './null.cache';

export interface CacheService {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

export const cacheService: CacheService = {
  async getJson<T>(key: string): Promise<T | null> {
    const client = await getRedisClient();
    if (!client) {
      return nullCache.getJson<T>(key);
    }

    const raw = await client.get(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  },
  async setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const client = await getRedisClient();
    if (!client) {
      return nullCache.setJson(key, value, ttlSeconds);
    }

    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  },
};
