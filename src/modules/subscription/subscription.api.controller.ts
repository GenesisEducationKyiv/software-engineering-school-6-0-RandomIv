import { NextFunction, Request, Response, Router } from 'express';
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
            message: MESSAGES.SUBSCRIBE_SUCCESS,
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
            message: MESSAGES.CONFIRM_SUCCESS,
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
            message: MESSAGES.UNSUBSCRIBE_SUCCESS,
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
