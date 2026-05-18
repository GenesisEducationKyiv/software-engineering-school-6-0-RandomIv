import { Request, Response, Router } from 'express';
import { MESSAGES } from '../../common/constants/messages.constant';
import { SubscriptionService } from './subscription.service';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from './subscription.schema';
import { toSubscriptionDto } from './subscription.mapper';

export class SubscriptionApiController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  subscribe = async (req: Request, res: Response) => {
    const { email, repo } = subscribeSchema.parse(req.body);
    await this.subscriptionService.subscribe({ email, repo });
    res.json({ message: MESSAGES.SUBSCRIBE_SUCCESS });
  };

  confirm = async (req: Request, res: Response) => {
    const { token } = tokenParamSchema.parse(req.params);
    await this.subscriptionService.confirmSubscription({ token });
    res.json({ message: MESSAGES.CONFIRM_SUCCESS });
  };

  unsubscribe = async (req: Request, res: Response) => {
    const { token } = tokenParamSchema.parse(req.params);
    await this.subscriptionService.unsubscribeByToken({ token });
    res.json({ message: MESSAGES.UNSUBSCRIBE_SUCCESS });
  };

  getSubscriptions = async (req: Request, res: Response) => {
    const { email } = subscriptionsQuerySchema.parse(req.query);
    const subscriptions =
      await this.subscriptionService.getSubscriptionsByEmail({ email });
    res.json(subscriptions.map(toSubscriptionDto));
  };
}
