import request from 'supertest';
import { createApp } from '../../src/app';
import { createDependencyContainer } from '../../src/dependency-container';
import { API_KEY_HEADER } from '../../src/common/middlewares/api-key.middleware';
import { NodemailerService } from '../../src/integrations/email/email.service';
import { AppUrls } from '../../src/common/utils/url-builder.util';
import { config } from '../../src/config';
import { MESSAGES } from '../../src/common/constants/messages.constant';
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
    const emailSpy = jest
      .spyOn(NodemailerService.prototype, 'sendSubscriptionConfirmationEmail')
      .mockResolvedValue();

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
    expect(emailSpy).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      AppUrls.confirm(appBaseUrl, subscription.confirmationToken),
      AppUrls.unsubscribe(appBaseUrl, subscription.unsubscribeToken),
    );
    const calledUrl = fetchSpy.mock.calls[0]?.[0];
    expect(
      calledUrl instanceof URL ? calledUrl.toString() : calledUrl,
    ).toContain('api.github.com/repos/owner/repo');
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
    const otherRepository = await prisma.repository.create({
      data: { fullName: 'owner/other-repo' },
    });
    await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        confirmed: false,
        repositoryId: otherRepository.id,
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

  it('GET /api/confirm/:token confirms subscription and returns JSON', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        repositoryId: repository.id,
      },
    });

    const response = await request(app)
      .get(`/api/confirm/${subscription.confirmationToken}`)
      .set(API_KEY_HEADER, TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: MESSAGES.CONFIRM_SUCCESS });

    const confirmed = await prisma.subscription.findUnique({
      where: { id: subscription.id },
    });
    expect(confirmed?.confirmed).toBe(true);
  });

  it('GET /api/unsubscribe/:token deletes subscription and returns JSON', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: {
        email: 'user@example.com',
        repositoryId: repository.id,
      },
    });

    const response = await request(app)
      .get(`/api/unsubscribe/${subscription.unsubscribeToken}`)
      .set(API_KEY_HEADER, TEST_API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: MESSAGES.UNSUBSCRIBE_SUCCESS });

    const deleted = await prisma.subscription.findUnique({
      where: { id: subscription.id },
    });
    expect(deleted).toBeNull();
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

  it('POST /web/subscribe creates subscription and sends confirmation email', async () => {
    const emailSpy = jest
      .spyOn(NodemailerService.prototype, 'sendSubscriptionConfirmationEmail')
      .mockResolvedValue();

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await request(app).post('/web/subscribe').send({
      email: 'user@example.com',
      repo: 'owner/repo',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: MESSAGES.SUBSCRIBE_SUCCESS });

    const subscription = await prisma.subscription.findFirst({
      where: { email: 'user@example.com' },
    });
    expect(subscription).not.toBeNull();
    expect(emailSpy).toHaveBeenCalled();
  });

  it('POST /web/subscribe returns 429 after exceeding the rate limit', async () => {
    jest
      .spyOn(NodemailerService.prototype, 'sendSubscriptionConfirmationEmail')
      .mockResolvedValue();
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post('/web/subscribe')
        .send({ email: `user${i}@example.com`, repo: 'owner/repo' });
      expect(response.status).toBe(200);
    }

    const response = await request(app)
      .post('/web/subscribe')
      .send({ email: 'user-over-limit@example.com', repo: 'owner/repo' });

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Too many requests, try again later.',
    });
  });
});
