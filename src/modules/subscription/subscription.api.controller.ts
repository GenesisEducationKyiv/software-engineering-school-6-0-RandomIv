import { NextFunction, Request, Response, Router } from 'express';
import {
  confirmSubscription,
  createSubscription,
  getSubscriptionsByEmail,
  unsubscribeByToken,
} from './subscription.service';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from './subscription.schema';
import { toSubscriptionDto } from './subscription.mapper';

const controller = Router();

controller.post(
  '/subscribe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, repo } = subscribeSchema.parse(req.body);
      await createSubscription({
        email,
        repo,
      });

      res.json({
        message: 'Subscription successful. Confirmation email sent.',
      });
    } catch (error) {
      next(error);
    }
  },
);

controller.get(
  '/confirm/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await confirmSubscription({ token });

      res.json({
        message: 'Subscription confirmed successfully',
      });
    } catch (error) {
      next(error);
    }
  },
);

controller.get(
  '/unsubscribe/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await unsubscribeByToken({ token });

      res.json({
        message: 'Unsubscribed successfully',
      });
    } catch (error) {
      next(error);
    }
  },
);

controller.get(
  '/subscriptions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = subscriptionsQuerySchema.parse(req.query);
      const subscriptions = await getSubscriptionsByEmail({ email });
      res.json(subscriptions.map(toSubscriptionDto));
    } catch (error) {
      next(error);
    }
  },
);

export default controller;
