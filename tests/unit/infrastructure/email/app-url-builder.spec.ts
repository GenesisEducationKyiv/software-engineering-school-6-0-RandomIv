import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';

describe('AppUrlBuilder', () => {
  it('builds web path with a single /web prefix even when baseUrl has trailing slash', () => {
    const urls = new AppUrlBuilder('http://localhost:3000/');
    expect(urls.webPath('/confirm/abc')).toBe('http://localhost:3000/web/confirm/abc');
  });
});
