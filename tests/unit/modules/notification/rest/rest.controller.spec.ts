import request from 'supertest';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import {
  NotificationRestController,
  createNotificationRouter,
} from '../../../../../src/modules/notification/rest/rest.controller';
import type { NotificationChannel } from '../../../../../src/modules/notification/delivery/notification-channel.interface';

const createApp = (channel: NotificationChannel) => {
  const app = express();
  app.use(express.json());
  app.use(createNotificationRouter(new NotificationRestController(channel)));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(422).json({ error: err.message });
  });
  return app;
};

describe('rest/rest.controller', () => {
  const channel: jest.Mocked<NotificationChannel> = {
    sendConfirmation: jest.fn().mockResolvedValue(undefined),
    sendRelease: jest.fn().mockResolvedValue(undefined),
  };

  const app = createApp(channel);

  describe('POST /send-confirmation', () => {
    it('calls sendConfirmation and returns 200', async () => {
      const body = {
        to: 'user@example.com',
        repo: 'owner/repo',
        confirmationUrl: 'https://app.example.com/confirm/token',
        unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
      };

      const res = await request(app).post('/send-confirmation').send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Confirmation sent' });
      expect(channel.sendConfirmation).toHaveBeenCalledWith(
        body.to,
        body.repo,
        body.confirmationUrl,
        body.unsubscribeUrl,
      );
    });

    it('returns 422 when required fields are missing', async () => {
      const res = await request(app)
        .post('/send-confirmation')
        .send({ to: 'user@example.com' });

      expect(res.status).toBe(422);
      expect(channel.sendConfirmation).not.toHaveBeenCalled();
    });

    it('returns 422 when email is invalid', async () => {
      const res = await request(app).post('/send-confirmation').send({
        to: 'not-an-email',
        repo: 'owner/repo',
        confirmationUrl: 'https://app.example.com/confirm/token',
        unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
      });

      expect(res.status).toBe(422);
    });
  });

  describe('POST /send-release', () => {
    it('calls sendRelease and returns 200', async () => {
      const body = {
        to: 'user@example.com',
        repo: 'owner/repo',
        tag: 'v2.0.0',
        releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
        unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
      };

      const res = await request(app).post('/send-release').send(body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Release notification sent' });
      expect(channel.sendRelease).toHaveBeenCalledWith(
        body.to,
        body.repo,
        body.tag,
        body.releaseUrl,
        body.unsubscribeUrl,
      );
    });

    it('returns 422 when tag is missing', async () => {
      const res = await request(app).post('/send-release').send({
        to: 'user@example.com',
        repo: 'owner/repo',
        releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
        unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
      });

      expect(res.status).toBe(422);
      expect(channel.sendRelease).not.toHaveBeenCalled();
    });

    it('returns 422 when releaseUrl is not a valid URL', async () => {
      const res = await request(app).post('/send-release').send({
        to: 'user@example.com',
        repo: 'owner/repo',
        tag: 'v2.0.0',
        releaseUrl: 'not-a-url',
        unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
      });

      expect(res.status).toBe(422);
    });
  });
});
