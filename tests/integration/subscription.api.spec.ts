import request from 'supertest';
import { createApp } from '../../src/app';
import { createDependencyContainer } from '../../src/dependency-container';
import { API_KEY_HEADER } from '../../src/common/middlewares/api-key.middleware';
import { NodemailerService } from '../../src/integrations/email/email.service';
import { AppUrls } from '../../src/common/utils/url-builder.util';
import { config } from '../../src/config';
import prisma from '../../src/core/db/db';

const appBaseUrl = config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;
const TEST_API_KEY = config.API_KEY;
const container = createDependencyContainer();
const app = createApp({
  apiController: container.apiController,
  webController: container.webController,
});

describe('subscription routes integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
