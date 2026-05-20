import { NoopCache } from '../../../../src/infrastructure/cache/noop.cache';

describe('NoopCache', () => {
  it('always returns null on getJson', async () => {
    const cache = new NoopCache();
    await expect(cache.getJson('k')).resolves.toBeNull();
  });
  it('setJson is a no-op (does not throw)', async () => {
    const cache = new NoopCache();
    await expect(cache.setJson('k', { v: 1 }, 60)).resolves.toBeUndefined();
  });
});
