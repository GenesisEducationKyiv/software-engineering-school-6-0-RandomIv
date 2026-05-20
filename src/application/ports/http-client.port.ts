export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export interface HttpClientPort {
  request<T>(url: string, options?: HttpRequestOptions): Promise<T>;
}
