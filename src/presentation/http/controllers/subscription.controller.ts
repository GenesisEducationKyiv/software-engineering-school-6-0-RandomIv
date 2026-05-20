import type { NextFunction, Request, Response } from 'express';
import { SubscribeUseCase } from '../../../application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from '../../../application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../../../application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from '../../../application/subscription/list-subscriptions.use-case';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../dto/subscription.schema';
import { toSubscriptionDto } from '../dto/subscription.mapper';

const SUBSCRIBE_OK = {
  message: 'Subscription successful. Confirmation email sent.',
};
const CONFIRM_OK = { message: 'Subscription confirmed successfully' };
const UNSUBSCRIBE_OK = { message: 'Unsubscribed successfully' };

export class SubscriptionController {
  constructor(
    private readonly subscribe: SubscribeUseCase,
    private readonly confirm: ConfirmSubscriptionUseCase,
    private readonly unsubscribe: UnsubscribeUseCase,
    private readonly list: ListSubscriptionsUseCase,
  ) {}

  subscribeHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = subscribeSchema.parse(req.body);
      await this.subscribe.execute(input);
      res.json(SUBSCRIBE_OK);
    } catch (e) {
      next(e);
    }
  };

  confirmHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await this.confirm.execute({ token });
      res.json(CONFIRM_OK);
    } catch (e) {
      next(e);
    }
  };

  unsubscribeHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await this.unsubscribe.execute({ token });
      res.json(UNSUBSCRIBE_OK);
    } catch (e) {
      next(e);
    }
  };

  listHandler = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { email } = subscriptionsQuerySchema.parse(req.query);
      const subs = await this.list.execute({ email });
      res.json(subs.map(toSubscriptionDto));
    } catch (e) {
      next(e);
    }
  };
}
