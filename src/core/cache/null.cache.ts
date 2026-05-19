import type { CacheService } from './cache.service';

export const nullCache: CacheService = {
  getJson<T>(): Promise<T | null> {
    return Promise.resolve(null);
  },
  setJson(): Promise<void> {
    return Promise.resolve();
  },
};
