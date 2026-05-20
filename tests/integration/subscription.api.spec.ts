import request from 'supertest';
import { API_KEY_HEADER } from '../../src/presentation/http/middlewares/api-key.middleware';
import { config } from '../../src/config';
import { buildTestApp } from '../test-composition';
import { FakeGitHubClient } from '../fakes/fake-github.client';
import { FakeEmailSender } from '../fakes/fake-email.sender';

const TEST_API_KEY = config.API_KEY;

describe('subscription routes integration', () => {
  describe('API endpoints require x-api-key', () => {
    it('blocks POST /api/subscribe without API key', async () => {
      const { app } = buildTestApp();
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

    it('blocks GET /api/confirm/:token without API key', async () => {
      const { app } = buildTestApp();
      const response = await request(app).get(
        '/api/confirm/73d7f6d9-f3b2-42b7-b6de-7a12f052f7f4',
      );

      expect(response.status).toBe(401);
    });

    it('blocks GET /api/unsubscribe/:token without API key', async () => {
      const { app } = buildTestApp();
      const response = await request(app).get(
        '/api/unsubscribe/76d9f048-5cd9-4365-960e-c66f7fc9d69d',
      );

      expect(response.status).toBe(401);
    });

    it('blocks GET /api/subscriptions without API key', async () => {
      const { app } = buildTestApp();
      const response = await request(app).get(
        '/api/subscriptions?email=user@example.com',
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Protected API endpoints', () => {
    it('POST /api/subscribe returns 200 for valid payload with API key', async () => {
      const { app, email, subscriptions } = buildTestApp();

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
      expect(subscriptions.all()).toHaveLength(1);
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]!.to).toBe('user@example.com');
      expect(email.sent[0]!.subject).toContain('owner/repo');
    });

    it('POST /api/subscribe returns 400 for invalid body', async () => {
      const { app, subscriptions } = buildTestApp();
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
      expect(subscriptions.all()).toHaveLength(0);
    });

    it('POST /api/subscribe returns 404 when repository does not exist on GitHub', async () => {
      const { app, subscriptions } = buildTestApp({
        github: new FakeGitHubClient({ exists: false }),
      });

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
      expect(subscriptions.all()).toHaveLength(0);
    });

    it('POST /api/subscribe returns 409 for duplicate email + repo', async () => {
      const { app, subscriptions } = buildTestApp();

      const first = await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({ email: 'user@example.com', repo: 'owner/repo' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({ email: 'user@example.com', repo: 'owner/repo' });

      expect(second.status).toBe(409);
      expect(second.body).toEqual({
        status: 'error',
        message: 'Email already subscribed to this repository',
      });
      expect(subscriptions.all()).toHaveLength(1);
    });

    it('GET /api/confirm/:token confirms an existing subscription with API key', async () => {
      const { app, subscriptions } = buildTestApp();

      await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({ email: 'user@example.com', repo: 'owner/repo' });

      const [sub] = subscriptions.all();
      expect(sub).toBeDefined();

      const response = await request(app)
        .get(`/api/confirm/${sub!.confirmationToken}`)
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Subscription confirmed successfully',
      });
      const [confirmed] = subscriptions.all();
      expect(confirmed!.confirmed).toBe(true);
    });

    it('GET /api/confirm/:token returns 404 for unknown token', async () => {
      const { app } = buildTestApp();
      const response = await request(app)
        .get('/api/confirm/73d7f6d9-f3b2-42b7-b6de-7a12f052f7f4')
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(404);
    });

    it('GET /api/confirm/:token returns 400 for invalid token format', async () => {
      const { app } = buildTestApp();
      const response = await request(app)
        .get('/api/confirm/not-a-uuid')
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        message: 'Validation failed',
      });
    });

    it('GET /api/unsubscribe/:token unsubscribes by token with API key', async () => {
      const { app, subscriptions } = buildTestApp();

      await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({ email: 'user@example.com', repo: 'owner/repo' });

      const [sub] = subscriptions.all();
      expect(sub).toBeDefined();

      const response = await request(app)
        .get(`/api/unsubscribe/${sub!.unsubscribeToken}`)
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Unsubscribed successfully',
      });
      expect(subscriptions.all()).toHaveLength(0);
    });

    it('GET /api/unsubscribe/:token returns 404 for unknown token', async () => {
      const { app } = buildTestApp();
      const response = await request(app)
        .get('/api/unsubscribe/76d9f048-5cd9-4365-960e-c66f7fc9d69d')
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(404);
    });

    it('GET /api/subscriptions returns mapped subscriptions with API key', async () => {
      const { app, subscriptions, repositories } = buildTestApp();

      // seed a confirmed subscription
      await request(app)
        .post('/api/subscribe')
        .set(API_KEY_HEADER, TEST_API_KEY)
        .send({ email: 'user@example.com', repo: 'owner/repo' });

      const [sub] = subscriptions.all();
      await request(app)
        .get(`/api/confirm/${sub!.confirmationToken}`)
        .set(API_KEY_HEADER, TEST_API_KEY);

      // give the repo a lastSeenTag so the DTO includes it
      const repo = [...repositories.byName.values()].find(
        (r) => r.fullName === 'owner/repo',
      );
      expect(repo).toBeDefined();
      await repositories.updateLastSeenTag(repo!.id, 'v1.0.0');

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

    it('GET /api/subscriptions returns 400 for missing email', async () => {
      const { app } = buildTestApp();
      const response = await request(app)
        .get('/api/subscriptions')
        .set(API_KEY_HEADER, TEST_API_KEY);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        status: 'error',
        message: 'Validation failed',
      });
    });
  });

  describe('Public web endpoints', () => {
    it('POST /web/subscribe works without API key', async () => {
      const email = new FakeEmailSender();
      const { app } = buildTestApp({ email });

      const response = await request(app).post('/web/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Subscription successful. Confirmation email sent.',
      });
      expect(email.sent).toHaveLength(1);
    });

    it('GET /web/confirm/:token works without API key and renders HTML', async () => {
      const { app, subscriptions } = buildTestApp();

      await request(app).post('/web/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });
      const [sub] = subscriptions.all();
      expect(sub).toBeDefined();

      const response = await request(app).get(
        `/web/confirm/${sub!.confirmationToken}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Confirmed');
      expect(response.text).toContain(
        'Your subscription has been confirmed successfully.',
      );
    });

    it('GET /web/unsubscribe/:token works without API key and renders HTML', async () => {
      const { app, subscriptions } = buildTestApp();

      await request(app).post('/web/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });
      const [sub] = subscriptions.all();
      expect(sub).toBeDefined();

      const response = await request(app).get(
        `/web/unsubscribe/${sub!.unsubscribeToken}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Unsubscribed');
      expect(response.text).toContain(
        'You have been successfully unsubscribed.',
      );
    });

    it('still maps AppError responses in web routes (conflict on duplicate)', async () => {
      const { app } = buildTestApp();

      const first = await request(app).post('/web/subscribe').send({
        email: 'user@example.com',
        repo: 'owner/repo',
      });
      expect(first.status).toBe(200);

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
