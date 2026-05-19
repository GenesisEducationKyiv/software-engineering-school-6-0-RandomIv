import { HttpStatus } from '../../../../src/common/constants/http-status.constants';
import {
  AppError,
  NotFoundError,
  RateLimitError,
} from '../../../../src/common/errors';
import { httpClient } from '../../../../src/common/utils/http-client';

describe('http-client', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('appends params and skips null/undefined values', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await httpClient('https://example.com/releases', {
      params: {
        page: 1,
        q: 'test',
        includeDrafts: false,
        skip: undefined,
        nullable: null,
      },
    });

    const calledUrl = fetchSpy.mock.calls[0]?.[0] as URL;
    expect(calledUrl.toString()).toBe(
      'https://example.com/releases?page=1&q=test&includeDrafts=false',
    );
  });

  it('throws RateLimitError for 429', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Too many', { status: 429 }));

    await expect(httpClient('https://example.com')).rejects.toThrow(
      RateLimitError,
    );
  });

  it('throws NotFoundError for 404', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Not found', { status: 404 }));

    await expect(httpClient('https://example.com')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws AppError with response text for non-OK status', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('Gateway failed', { status: 502 }),
    );

    await expect(httpClient('https://example.com')).rejects.toMatchObject({
      statusCode: 502,
      message: 'Gateway failed',
    });
  });

  it('throws AppError with fallback message when error body is empty', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));

    await expect(httpClient('https://example.com')).rejects.toMatchObject({
      statusCode: 500,
      message: 'External API error: 500',
    });
  });

  it('returns undefined for 204', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await httpClient('https://example.com');

    expect(result).toBeUndefined();
  });

  it('returns plain text when content-type is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('plain text body', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const result = await httpClient<string>('https://example.com');

    expect(result).toBe('plain text body');
  });

  it('returns parsed JSON when content-type is JSON', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ tag_name: 'v1.0.0' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      }),
    );

    const result = await httpClient<{ tag_name: string }>(
      'https://example.com',
    );

    expect(result).toEqual({ tag_name: 'v1.0.0' });
  });

  it('throws AppError(500) when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network down'));

    await expect(httpClient('https://example.com')).rejects.toEqual(
      new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to reach external API',
      ),
    );
  });
});
