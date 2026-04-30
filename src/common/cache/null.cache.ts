import type { CacheService } from './cache.service';

export const nullCache: CacheService = {
  async getJson<T>(): Promise<T | null> {
    return null;
  },
  async setJson(): Promise<void> {
    return;
  },
};
