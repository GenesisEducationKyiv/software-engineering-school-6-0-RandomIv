import request from 'supertest';
import { createApp } from '../../src/app';
import { API_KEY_HEADER } from '../../src/common/middlewares/api-key.middleware';
import type { SubscriptionService } from '../../src/modules/subscription/subscription.service';

describe('app routing integration', () => {
  const subscriptionService: SubscriptionService = {
    createSubscription: jest.fn(),
    confirmSubscription: jest.fn(),
    unsubscribeByToken: jest.fn(),
    getSubscriptionsByEmail: jest.fn(),
  };
  const app = createApp({ subscriptionService });

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# HELP');
    expect(response.text).toContain('http_requests_total');
  });

  it('captures route templates and excludes /metrics from instrumentation', async () => {
    await request(app)
      .get('/api/confirm/not-a-uuid')
      .set(API_KEY_HEADER, 'test-api-key');

    const metricsResponse = await request(app).get('/metrics');

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
