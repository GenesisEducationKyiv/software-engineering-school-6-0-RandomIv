export const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
};

export const renderHtmlMessage = (
  title: string,
  message: string,
  isError = false,
): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #161618; color: #f0f0f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: #1e1e21; padding: 2rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 420px; width: 100%; }
    h1 { color: ${isError ? '#f87171' : '#4ade80'}; margin-top: 0; }
    p { color: #d1d1d1; line-height: 1.5; }
    a { color: #9ca3af; text-decoration: none; font-size: 0.9rem; margin-top: 1rem; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="/">&larr; Back to Home</a>
  </div>
</body>
</html>
`;
