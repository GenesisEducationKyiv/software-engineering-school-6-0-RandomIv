import { CachePort } from '../../application/ports/cache.port';

export class NoopCache implements CachePort {
  async getJson<T>(_key: string): Promise<T | null> { return null; }
  async setJson<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> { /* no-op */ }
}
