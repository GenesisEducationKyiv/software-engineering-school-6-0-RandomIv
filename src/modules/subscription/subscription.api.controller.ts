import { NextFunction, Request, Response, Router } from 'express';
import {
  SubscriptionService,
} from './subscription.service';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from './subscription.schema';
import { toSubscriptionDto } from './subscription.mapper';

const SUBSCRIBE_SUCCESS_MESSAGE = 'Subscription successful. Confirmation email sent.';
const CONFIRM_SUCCESS_MESSAGE = 'Subscription confirmed successfully';
const UNSUBSCRIBE_SUCCESS_MESSAGE = 'Unsubscribed successfully';

export class SubscriptionApiController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
  ) {}

  buildRouter(): Router {
    const controller = Router();

    controller.post(
      '/subscribe',
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { email, repo } = subscribeSchema.parse(req.body);
          await this.subscriptionService.createSubscription({
            email,
            repo,
          });

          res.json({
            message: SUBSCRIBE_SUCCESS_MESSAGE,
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
          await this.subscriptionService.confirmSubscription({ token });

          res.json({
            message: CONFIRM_SUCCESS_MESSAGE,
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
          await this.subscriptionService.unsubscribeByToken({ token });

          res.json({
            message: UNSUBSCRIBE_SUCCESS_MESSAGE,
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
          const subscriptions =
            await this.subscriptionService.getSubscriptionsByEmail({ email });
          res.json(subscriptions.map(toSubscriptionDto));
        } catch (error) {
          next(error);
        }
      },
    );

    return controller;
  }
}

export const createSubscriptionApiController = (
  subscriptionService: SubscriptionService,
): Router => {
  return new SubscriptionApiController(subscriptionService).buildRouter();
};
