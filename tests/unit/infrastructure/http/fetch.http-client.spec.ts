import { FetchHttpClient } from '../../../../src/infrastructure/http/fetch.http-client';
import { NotFoundError, RateLimitError, AppError } from '../../../../src/domain/errors';

const mockResponse = (body: unknown, status = 200, contentType = 'application/json'): Response =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => (k === 'content-type' ? contentType : null) },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

describe('FetchHttpClient', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('parses JSON on 200', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse({ a: 1 }));
    const client = new FetchHttpClient();
    await expect(client.request<{ a: number }>('https://x/y')).resolves.toEqual({ a: 1 });
  });

  it('throws NotFoundError on 404', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse('', 404));
    const client = new FetchHttpClient();
    await expect(client.request('https://x/y')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws RateLimitError on 429', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(mockResponse('', 429));
    const client = new FetchHttpClient();
    await expect(client.request('https://x/y')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws AppError when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValueOnce(new Error('connection refused'));
    const client = new FetchHttpClient();
    await expect(client.request('https://x/y')).rejects.toBeInstanceOf(AppError);
  });
});
