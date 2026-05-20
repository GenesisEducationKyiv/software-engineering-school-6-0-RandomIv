import request from 'supertest';
import { API_KEY_HEADER } from '../../src/presentation/http/middlewares/api-key.middleware';
import { config } from '../../src/config';
import { buildTestApp } from '../test-composition';

describe('app routing integration', () => {
  it('serves subscription page on root path', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Subscribe to GitHub releases');
  });

  it('returns health status', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('returns prometheus metrics', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# HELP');
    expect(response.text).toContain('http_requests_total');
  });

  it('captures route templates and excludes /metrics from instrumentation', async () => {
    const { app } = buildTestApp();
    await request(app)
      .get('/api/confirm/not-a-uuid')
      .set(API_KEY_HEADER, config.API_KEY);

    const metricsResponse = await request(app).get('/metrics');

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('route="/confirm/:token"');
    expect(metricsResponse.text).not.toContain('route="/metrics"');
  });

  it('returns 404 for unknown routes', async () => {
    const { app } = buildTestApp();
    const response = await request(app)
      .get('/api/unknown-route')
      .set(API_KEY_HEADER, config.API_KEY);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      status: 'error',
      message: 'API route not found',
    });
  });
});
