import { Request, Response, Router } from 'express';
import { MESSAGES } from '../../../common/constants/messages.constant';
import type { SubscriptionService } from '../subscription.service';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../subscription.schema';
import { toSubscriptionDto } from './subscription.mapper';

export class SubscriptionRestController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  subscribe = async (req: Request, res: Response): Promise<void> => {
    const { email, repo } = subscribeSchema.parse(req.body);
    await this.subscriptionService.subscribe({ email, repo });
    res.json({ message: MESSAGES.SUBSCRIBE_SUCCESS });
  };

  confirm = async (req: Request, res: Response): Promise<void> => {
    const { token } = tokenParamSchema.parse(req.params);
    await this.subscriptionService.confirmSubscription({ token });
    res.json({ message: MESSAGES.CONFIRM_SUCCESS });
  };

  unsubscribe = async (req: Request, res: Response): Promise<void> => {
    const { token } = tokenParamSchema.parse(req.params);
    await this.subscriptionService.unsubscribeByToken({ token });
    res.json({ message: MESSAGES.UNSUBSCRIBE_SUCCESS });
  };

  getSubscriptions = async (req: Request, res: Response): Promise<void> => {
    const { email } = subscriptionsQuerySchema.parse(req.query);
    const subscriptions =
      await this.subscriptionService.getSubscriptionsByEmail({ email });
    res.json(subscriptions.map(toSubscriptionDto));
  };
}

export const createSubscriptionApiRouter = (
  controller: SubscriptionRestController,
): Router => {
  const router = Router();
  router.post('/subscribe', controller.subscribe);
  router.get('/confirm/:token', controller.confirm);
  router.get('/unsubscribe/:token', controller.unsubscribe);
  router.get('/subscriptions', controller.getSubscriptions);
  return router;
};
