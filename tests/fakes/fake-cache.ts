import { CachePort } from '../../src/application/ports/cache.port';
export class FakeCache implements CachePort {
  private store = new Map<string, string>();
  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async setJson<T>(key: string, value: T, _ttl: number): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
}
