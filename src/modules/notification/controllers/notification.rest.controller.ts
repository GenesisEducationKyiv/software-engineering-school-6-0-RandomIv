import { Request, Response, Router } from 'express';
import type { NotificationChannel } from '../notification-channel.interface';
import {
  sendConfirmationSchema,
  sendReleaseSchema,
} from '../notification.schema';

export class NotificationRestController {
  constructor(private readonly channel: NotificationChannel) {}

  sendConfirmation = async (req: Request, res: Response): Promise<void> => {
    const { to, repo, confirmationUrl, unsubscribeUrl } =
      sendConfirmationSchema.parse(req.body);
    await this.channel.sendConfirmation(
      to,
      repo,
      confirmationUrl,
      unsubscribeUrl,
    );
    res.json({ message: 'Confirmation sent' });
  };

  sendRelease = async (req: Request, res: Response): Promise<void> => {
    const { to, repo, tag, releaseUrl, unsubscribeUrl } =
      sendReleaseSchema.parse(req.body);
    await this.channel.sendRelease(to, repo, tag, releaseUrl, unsubscribeUrl);
    res.json({ message: 'Release notification sent' });
  };
}

export const createNotificationRouter = (
  controller: NotificationRestController,
): Router => {
  const router = Router();
  router.post('/send-confirmation', controller.sendConfirmation);
  router.post('/send-release', controller.sendRelease);
  return router;
};
