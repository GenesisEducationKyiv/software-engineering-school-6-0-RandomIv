import request from 'supertest';
import { createApp } from '../../src/app';
import { API_KEY_HEADER } from '../../src/common/middlewares/api-key.middleware';
import { createDependencyContainer } from '../../src/dependency-container';

describe('app routing integration', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    const container = createDependencyContainer();
    app = createApp({
      apiController: container.apiController,
      webController: container.webController,
    });
  });

  it('serves subscription page on root path', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Subscribe to GitHub releases');
  });

  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('returns prometheus metrics', async () => {
    const response = await request(app)
      .get('/metrics')
      .set(API_KEY_HEADER, 'test-api-key');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# HELP');
    expect(response.text).toContain('http_requests_total');
  });

  it('captures route templates and excludes /metrics from instrumentation', async () => {
    await request(app)
      .get('/api/confirm/not-a-uuid')
      .set(API_KEY_HEADER, 'test-api-key');

    const metricsResponse = await request(app)
      .get('/metrics')
      .set(API_KEY_HEADER, 'test-api-key');

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('route="/confirm/:token"');
    expect(metricsResponse.text).not.toContain('route="/metrics"');
  });

  it('returns 404 for unknown routes', async () => {
    const response = await request(app)
      .get('/api/unknown-route')
      .set(API_KEY_HEADER, 'test-api-key');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 'error',
      message: 'API route not found',
    });
  });
});
