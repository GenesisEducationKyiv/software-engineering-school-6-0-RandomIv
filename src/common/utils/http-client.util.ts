import { RateLimitError, AppError, NotFoundError } from '../errors';
import { HttpStatus } from '../constants/http-status.constant';

type FetchOptions = RequestInit & {
  params?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
};

const buildUrl = (rawUrl: string, params?: FetchOptions['params']): URL => {
  const url = new URL(rawUrl);

  if (!params) return url;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  return url;
};

const throwForHttpError = async (response: Response): Promise<void> => {
  if (response.status === HttpStatus.TOO_MANY_REQUESTS) {
    throw new RateLimitError();
  }

  if (response.status === HttpStatus.NOT_FOUND) {
    throw new NotFoundError('Resource not found');
  }

  if (!response.ok) {
    const details = await response.text();
    throw new AppError(
      response.status,
      details || `External API error: ${response.status}`,
    );
  }
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return (await response.text()) as T;
  }

  return (await response.json()) as T;
};

export async function httpClient<T>(
  rawUrl: string,
  { params, timeoutMs, ...options }: FetchOptions = {},
): Promise<T> {
  const url = buildUrl(rawUrl, params);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      ...options,
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
  } catch {
    throw new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'Failed to reach external API',
    );
  }

  await throwForHttpError(response);
  return parseResponse<T>(response);
}
