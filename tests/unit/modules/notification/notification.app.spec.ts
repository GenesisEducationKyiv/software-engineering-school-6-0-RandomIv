import request from 'supertest';
import type { NotificationChannel } from '../../../../src/modules/notification/notification-channel.interface';
import { NotificationRestController } from '../../../../src/modules/notification/controllers/notification.rest.controller';
import { createNotificationApp } from '../../../../src/modules/notification/notification.app';
import { INTERNAL_KEY_HEADER } from '../../../../src/modules/notification/middlewares/internal-auth.middleware';

const API_KEY = 'test-internal-key';

const validConfirmation = {
  to: 'user@example.com',
  repo: 'owner/repo',
  confirmationUrl: 'https://app.example.com/confirm/token',
  unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
};

const validRelease = {
  to: 'user@example.com',
  repo: 'owner/repo',
  tag: 'v1.2.3',
  releaseUrl: 'https://github.com/owner/repo/releases/tag/v1.2.3',
  unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
};

describe('notification app', () => {
  let channel: jest.Mocked<NotificationChannel>;
  let app: ReturnType<typeof createNotificationApp>;

  beforeEach(() => {
    channel = {
      sendConfirmation: jest.fn().mockResolvedValue(undefined),
      sendRelease: jest.fn().mockResolvedValue(undefined),
    };
    app = createNotificationApp({
      controller: new NotificationRestController(channel),
      apiKey: API_KEY,
    });
  });

  it('exposes an unauthenticated health check', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  describe('POST /send-confirmation', () => {
    it('sends the confirmation and returns 200 for a valid request', async () => {
      const response = await request(app)
        .post('/send-confirmation')
        .set(INTERNAL_KEY_HEADER, API_KEY)
        .send(validConfirmation);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Confirmation sent' });
      expect(channel.sendConfirmation).toHaveBeenCalledWith(
        validConfirmation.to,
        validConfirmation.repo,
        validConfirmation.confirmationUrl,
        validConfirmation.unsubscribeUrl,
      );
    });

    it('returns 400 for an invalid body without touching the channel', async () => {
      const response = await request(app)
        .post('/send-confirmation')
        .set(INTERNAL_KEY_HEADER, API_KEY)
        .send({ ...validConfirmation, to: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'error',
          message: 'Validation failed',
        }),
      );
      expect(response.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'to' })]),
      );
      expect(channel.sendConfirmation).not.toHaveBeenCalled();
    });

    it('returns 500 when the channel fails to send', async () => {
      channel.sendConfirmation.mockRejectedValue(new Error('SMTP down'));

      const response = await request(app)
        .post('/send-confirmation')
        .set(INTERNAL_KEY_HEADER, API_KEY)
        .send(validConfirmation);

      expect(response.status).toBe(500);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'error',
          message: 'Internal Server Error',
        }),
      );
    });
  });

  describe('POST /send-release', () => {
    it('sends the release notification and returns 200 for a valid request', async () => {
      const response = await request(app)
        .post('/send-release')
        .set(INTERNAL_KEY_HEADER, API_KEY)
        .send(validRelease);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Release notification sent' });
      expect(channel.sendRelease).toHaveBeenCalledWith(
        validRelease.to,
        validRelease.repo,
        validRelease.tag,
        validRelease.releaseUrl,
        validRelease.unsubscribeUrl,
      );
    });

    it('returns 400 for an invalid body', async () => {
      const response = await request(app)
        .post('/send-release')
        .set(INTERNAL_KEY_HEADER, API_KEY)
        .send({ ...validRelease, tag: '' });

      expect(response.status).toBe(400);
      expect(channel.sendRelease).not.toHaveBeenCalled();
    });
  });

  describe('internal authentication', () => {
    it('returns 401 when the internal key is missing', async () => {
      const response = await request(app)
        .post('/send-confirmation')
        .send(validConfirmation);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        status: 'error',
        message: 'Invalid API key',
      });
      expect(channel.sendConfirmation).not.toHaveBeenCalled();
    });

    it('returns 401 when the internal key is wrong', async () => {
      const response = await request(app)
        .post('/send-confirmation')
        .set(INTERNAL_KEY_HEADER, 'wrong-key')
        .send(validConfirmation);

      expect(response.status).toBe(401);
      expect(channel.sendConfirmation).not.toHaveBeenCalled();
    });
  });
});
