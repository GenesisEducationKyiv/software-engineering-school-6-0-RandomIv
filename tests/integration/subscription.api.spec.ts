import request from 'supertest';
import { createApp } from '../../src/app';
import { createDependencyContainer } from '../../src/dependency-container';
import { API_KEY_HEADER } from '../../src/common/middlewares/api-key.middleware';
import { AppUrls } from '../../src/common/utils/url-builder.util';
import { config } from '../../src/config';
import prisma from '../../src/core/db/db';

const appBaseUrl = config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;
const TEST_API_KEY = config.API_KEY;
let app: ReturnType<typeof createApp>;

describe('subscription routes integration', () => {
  beforeAll(() => {
    const container = createDependencyContainer();
    app = createApp({
      apiController: container.apiController,
      webController: container.webController,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Security - API endpoints require x-api-key', () => {
    it('POST /api/subscribe returns 401 when x-api-key is missing', async () => {
      const response = await request(app).post('/api/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Invalid API key',
      });
    });

    it('GET /api/subscriptions returns 401 when x-api-key is missing', async () => {
      const response = await request(app).get(
        '/api/subscriptions?email=user@example.com',
      );

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Invalid API key',
      });
    });
  });

  it('POST /api/subscribe returns 400 for invalid body', async () => {
    const response = await request(app)
      .post('/api/subscribe')
      .set(API_KEY_HEADER, TEST_API_KEY)
      .send({
        email: 'not-an-email',
        repo: 'invalid',
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'error',
        message: 'Validation failed',
      }),
    );
    expect(response.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'repo' }),
      ]),
    );
  });

  it('POST /api/subscribe creates subscription and sends confirmation email', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await request(app)
      .post('/api/subscribe')
      .set(API_KEY_HEADER, TEST_API_KEY)
      .send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'Subscription successful. Confirmation email sent.',
    });

    const subscription = await prisma.subscription.findFirst({
      where: { email: 'user@example.com' },
      include: { repository: true },
    });

    expect(subscription).not.toBeNull();
    if (!subscription) {
      throw new Error('Subscription was not created');
    }

    expect(subscription.repository.fullName).toBe('owner/repo');

    const toUrl = (input: Parameters<typeof fetch>[0]): string => {
      if (input instanceof URL) return input.href;
      if (typeof input === 'string') return input;
      return input.url;
    };

    const calls = fetchSpy.mock.calls.map((c) => toUrl(c[0]));
    expect(
      calls.some((url) => url.includes('api.github.com/repos/owner/repo')),
    ).toBe(true);
    expect(calls.some((url) => url.includes('/send-confirmation'))).toBe(true);

    const notificationCall = fetchSpy.mock.calls.find((c) =>
      toUrl(c[0]).includes('/send-confirmation'),
    );
    expect(notificationCall).toBeDefined();
    const body = JSON.parse(notificationCall![1]!.body as string);
    expect(body).toEqual({
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: AppUrls.confirm(
        appBaseUrl,
        subscription.confirmationToken,
      ),
      unsubscribeUrl: AppUrls.unsubscribe(
        appBaseUrl,
        subscription.unsubscribeToken,
      ),
    });
  });

  it('POST /api/subscribe maps ConflictError to 409', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        repositoryId: repository.id,
      },
    });

    const response = await request(app)
      .post('/api/subscribe')
      .set(API_KEY_HEADER, TEST_API_KEY)
      .send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Email already subscribed to this repository',
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('GET /api/subscriptions returns stored subscriptions', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo', lastSeenTag: 'v1.0.0' },
    });
    await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        confirmed: true,
        repositoryId: repository.id,
      },
    });

    const response = await request(app)
      .get('/api/subscriptions?email=user@example.com')
      .set(API_KEY_HEADER, TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        email: 'user@example.com',
        repo: 'owner/repo',
        confirmed: true,
        last_seen_tag: 'v1.0.0',
      },
    ]);
  });

  it('GET /web/confirm/:token renders confirmation page', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        repositoryId: repository.id,
      },
    });

    const response = await request(app).get(
      `/web/confirm/${subscription.confirmationToken}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Confirmed');
    expect(response.text).toContain(
      'Your subscription has been confirmed successfully.',
    );
  });

  it('GET /web/confirm/:token renders AppError page when token already used', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        confirmed: true,
        repositoryId: repository.id,
      },
    });

    const response = await request(app).get(
      `/web/confirm/${subscription.confirmationToken}`,
    );

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Request failed');
    expect(response.text).toContain('Token already used');
  });

  it('GET /web/unsubscribe/:token renders unsubscribe page', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        repositoryId: repository.id,
      },
    });

    const response = await request(app).get(
      `/web/unsubscribe/${subscription.unsubscribeToken}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Unsubscribed');
    expect(response.text).toContain('You have been successfully unsubscribed.');

    const deleted = await prisma.subscription.findUnique({
      where: { id: subscription.id },
    });
    expect(deleted).toBeNull();
  });
});
