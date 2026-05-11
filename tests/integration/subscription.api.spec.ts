import request from 'supertest';
import { createApp } from '../../src/app';
import { AppError, NotFoundError } from '../../src/common/errors';
import { API_KEY_HEADER } from '../../src/common/middlewares/api-key.middleware';
import type { SubscriptionService } from '../../src/modules/subscription/subscription.service';
import type { Subscription } from '../../src/generated/prisma/client';
import type { SubscriptionWithRepository } from '../../src/common/types/subscription-with-repository.type';

const TEST_API_KEY = 'test-api-key';

describe('subscription routes integration', () => {
  const subscriptionService: SubscriptionService = {
    createSubscription: jest.fn(),
    confirmSubscription: jest.fn(),
    unsubscribeByToken: jest.fn(),
    getSubscriptionsByEmail: jest.fn(),
  };

  const app = createApp({ subscriptionService });

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('API endpoints require x-api-key', () => {
    it('blocks POST /api/subscribe without API key', async () => {
      const response = await request(app).post('/api/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Invalid API key',
      });
      expect(subscriptionService.createSubscription).not.toHaveBeenCalled();
    });

    it('blocks GET /api/confirm/:token without API key', async () => {
      const response = await request(app).get(
        '/api/confirm/73d7f6d9-f3b2-42b7-b6de-7a12f052f7f4',
      );

      expect(response.status).toBe(401);
      expect(subscriptionService.confirmSubscription).not.toHaveBeenCalled();
    });

    it('blocks GET /api/unsubscribe/:token without API key', async () => {
      const response = await request(app).get(
        '/api/unsubscribe/76d9f048-5cd9-4365-960e-c66f7fc9d69d',
      );

      expect(response.status).toBe(401);
      expect(subscriptionService.unsubscribeByToken).not.toHaveBeenCalled();
    });

    it('blocks GET /api/subscriptions without API key', async () => {
      const response = await request(app).get(
        '/api/subscriptions?email=user@example.com',
      );

      expect(response.status).toBe(401);
      expect(subscriptionService.getSubscriptionsByEmail).not.toHaveBeenCalled();
    });
  });

  describe('Protected API endpoints', () => {
    it('POST /api/subscribe returns 200 for valid payload with API key', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-1',
        email: 'user@example.com',
        confirmed: false,
        confirmationToken: '0f6d4db7-bdd9-4f95-a8a6-08539b34d7c6',
        unsubscribeToken: 'd93f4ce3-bd06-4bbc-a3cf-5ca619fd6f17',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        repositoryId: 'repo-1',
      };

      (
        subscriptionService.createSubscription as jest.MockedFunction<
          SubscriptionService['createSubscription']
        >
      ).mockResolvedValueOnce(mockSubscription);

      const response = await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({
          email: 'user@example.com',
          repo: ' owner/repo ',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'Subscription successful. Confirmation email sent.',
      });
      expect(subscriptionService.createSubscription).toHaveBeenCalledWith({
        email: 'user@example.com',
        repo: 'owner/repo',
      });
    });

    it('POST /api/subscribe returns 400 for invalid body', async () => {
      const response = await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({
          email: 'not-an-email',
          repo: 'owner/repo',
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        message: 'Validation failed',
      });
      expect(subscriptionService.createSubscription).not.toHaveBeenCalled();
    });

    it('POST /api/subscribe maps service errors', async () => {
      (
        subscriptionService.createSubscription as jest.MockedFunction<
          SubscriptionService['createSubscription']
        >
      ).mockRejectedValueOnce(new NotFoundError('Repository not found on GitHub'));

      const response = await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({
          email: 'user@example.com',
          repo: 'owner/repo',
        });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Repository not found on GitHub',
      });
    });

    it('GET /api/confirm/:token works with API key', async () => {
      (
        subscriptionService.confirmSubscription as jest.MockedFunction<
          SubscriptionService['confirmSubscription']
        >
      ).mockResolvedValueOnce();

      const token = '73d7f6d9-f3b2-42b7-b6de-7a12f052f7f4';
      const response = await request(app)
        .get(`/api/confirm/${token}`)
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Subscription confirmed successfully',
      });
      expect(subscriptionService.confirmSubscription).toHaveBeenCalledWith({
        token,
      });
    });

    it('GET /api/unsubscribe/:token works with API key', async () => {
      (
        subscriptionService.unsubscribeByToken as jest.MockedFunction<
          SubscriptionService['unsubscribeByToken']
        >
      ).mockResolvedValueOnce();

      const token = '76d9f048-5cd9-4365-960e-c66f7fc9d69d';
      const response = await request(app)
        .get(`/api/unsubscribe/${token}`)
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Unsubscribed successfully',
      });
      expect(subscriptionService.unsubscribeByToken).toHaveBeenCalledWith({
        token,
      });
    });

    it('GET /api/subscriptions returns mapped subscriptions with API key', async () => {
      const mockSubscription: SubscriptionWithRepository = {
        id: 'sub-1',
        email: 'user@example.com',
        confirmed: true,
        confirmationToken: 'a3ef2aa2-f770-451e-b4fd-f57afd94ec2d',
        unsubscribeToken: 'f202f85e-2d90-414b-8d85-56f8f64d8fd5',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        repositoryId: 'repo-1',
        repository: {
          id: 'repo-1',
          fullName: 'owner/repo',
          lastSeenTag: 'v1.0.0',
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      };

      (
        subscriptionService.getSubscriptionsByEmail as jest.MockedFunction<
          SubscriptionService['getSubscriptionsByEmail']
        >
      ).mockResolvedValueOnce([mockSubscription]);

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
      expect(subscriptionService.getSubscriptionsByEmail).toHaveBeenCalledWith({
        email: 'user@example.com',
      });
    });
  });

  describe('Public web endpoints', () => {
    it('POST /web/subscribe works without API key', async () => {
      const mockSubscription: Subscription = {
        id: 'sub-1',
        email: 'user@example.com',
        confirmed: false,
        confirmationToken: '0f6d4db7-bdd9-4f95-a8a6-08539b34d7c6',
        unsubscribeToken: 'd93f4ce3-bd06-4bbc-a3cf-5ca619fd6f17',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        repositoryId: 'repo-1',
      };

      (
        subscriptionService.createSubscription as jest.MockedFunction<
          SubscriptionService['createSubscription']
        >
      ).mockResolvedValueOnce(mockSubscription);

      const response = await request(app).post('/web/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Subscription successful. Confirmation email sent.',
      });
    });

    it('GET /web/confirm/:token works without API key', async () => {
      (
        subscriptionService.confirmSubscription as jest.MockedFunction<
          SubscriptionService['confirmSubscription']
        >
      ).mockResolvedValueOnce();
      const token = '866ffeb1-82e7-456e-b5a7-2b2fc345ff16';

      const response = await request(app).get(`/web/confirm/${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Confirmed');
      expect(response.text).toContain(
        'Your subscription has been confirmed successfully.',
      );
    });

    it('GET /web/unsubscribe/:token works without API key', async () => {
      (
        subscriptionService.unsubscribeByToken as jest.MockedFunction<
          SubscriptionService['unsubscribeByToken']
        >
      ).mockResolvedValueOnce();
      const token = '984fc3f9-3800-4a4a-9d2b-d8edff4b97f4';

      const response = await request(app).get(`/web/unsubscribe/${token}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Unsubscribed');
      expect(response.text).toContain('You have been successfully unsubscribed.');
    });

    it('still maps AppError responses in web routes', async () => {
      (
        subscriptionService.createSubscription as jest.MockedFunction<
          SubscriptionService['createSubscription']
        >
      ).mockRejectedValueOnce(
        new AppError(409, 'Email already subscribed to this repository'),
      );

      const response = await request(app).post('/web/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Email already subscribed to this repository',
      });
    });
  });
});
