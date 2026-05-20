import { HttpClientPort, HttpRequestOptions } from '../../application/ports/http-client.port';
import { AppError, NotFoundError, RateLimitError } from '../../domain/errors';
import { HttpStatus } from '../../common/constants/http-status.constants';

const buildUrl = (rawUrl: string, params?: HttpRequestOptions['params']): URL => {
  const url = new URL(rawUrl);
  if (!params) return url;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
};

const throwForHttpError = async (response: Response): Promise<void> => {
  if (response.status === HttpStatus.TOO_MANY_REQUESTS) throw new RateLimitError();
  if (response.status === HttpStatus.NOT_FOUND) throw new NotFoundError('Resource not found');
  if (!response.ok) {
    const details = await response.text();
    throw new AppError(response.status, details || `External API error: ${response.status}`);
  }
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return (await response.text()) as T;
  return (await response.json()) as T;
};

export class FetchHttpClient implements HttpClientPort {
  async request<T>(rawUrl: string, options: HttpRequestOptions = {}): Promise<T> {
    const { params, ...init } = options;
    const url = buildUrl(rawUrl, params);

    let response: Response;
    try {
      response = await fetch(url, { method: init.method ?? 'GET', ...init });
    } catch {
      throw new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to reach external API');
    }

    await throwForHttpError(response);
    return parseResponse<T>(response);
  }
}
