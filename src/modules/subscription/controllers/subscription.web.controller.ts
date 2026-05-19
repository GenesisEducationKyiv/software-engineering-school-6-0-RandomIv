import { Request, Response, Router } from 'express';
import { MESSAGES } from '../../../common/constants/messages.constant';
import { SubscriptionService } from '../subscription.service';
import { subscribeSchema, tokenParamSchema } from '../subscription.schema';
import { webSubscribeLimiter } from '../../../common/middlewares/rate-limit.middleware';
import { renderHtmlMessage } from '../../../views/html.template';
import { sendWebError } from '../../../common/utils/web-error.util';

export class SubscriptionWebController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  subscribe = async (req: Request, res: Response): Promise<void> => {
    const { email, repo } = subscribeSchema.parse(req.body);
    await this.subscriptionService.subscribe({ email, repo });
    res.json({ message: MESSAGES.SUBSCRIBE_SUCCESS });
  };

  confirm = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await this.subscriptionService.confirmSubscription({ token });
      res.send(
        renderHtmlMessage(
          'Confirmed',
          'Your subscription has been confirmed successfully.',
        ),
      );
    } catch (error) {
      sendWebError(res, error);
    }
  };

  unsubscribe = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await this.subscriptionService.unsubscribeByToken({ token });
      res.send(
        renderHtmlMessage(
          'Unsubscribed',
          'You have been successfully unsubscribed.',
        ),
      );
    } catch (error) {
      sendWebError(res, error);
    }
  };
}

export const createSubscriptionWebRouter = (
  controller: SubscriptionWebController,
): Router => {
  const router = Router();
  router.post('/subscribe', webSubscribeLimiter, controller.subscribe);
  router.get('/confirm/:token', controller.confirm);
  router.get('/unsubscribe/:token', controller.unsubscribe);
  return router;
};
