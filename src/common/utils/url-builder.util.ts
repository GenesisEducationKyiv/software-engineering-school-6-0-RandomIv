export const buildWebUrl = (baseUrl: string, path: string): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  if (!normalizedPath) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/${normalizedPath}`;
};

export const AppUrls = {
  unsubscribe: (baseUrl: string, token: string): string =>
    buildWebUrl(baseUrl, `/web/unsubscribe/${encodeURIComponent(token)}`),
  confirm: (baseUrl: string, token: string): string =>
    buildWebUrl(baseUrl, `/web/confirm/${encodeURIComponent(token)}`),
};
