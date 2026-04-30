import { NextFunction, Request, Response, Router } from 'express';
import {
  confirmSubscription,
  createSubscription,
  unsubscribeByToken,
} from './subscription.service';
import { subscribeSchema, tokenParamSchema } from './subscription.schema';
import { webSubscribeLimiter } from '../../common/middlewares/rate-limit.middleware';
import { renderHtmlMessage } from '../../common/views/html.template';
import { sendWebError } from '../../common/utils/web-error.util';

const webController = Router();

webController.post(
  '/subscribe',
  webSubscribeLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, repo } = subscribeSchema.parse(req.body);
      await createSubscription({ email, repo });

      res.json({
        message: 'Subscription successful. Confirmation email sent.',
      });
    } catch (error) {
      next(error);
    }
  },
);

webController.get(
  '/confirm/:token',
  async (req: Request, res: Response) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await confirmSubscription({ token });

      res.send(
        renderHtmlMessage(
          'Confirmed',
          'Your subscription has been confirmed successfully.',
        ),
      );
    } catch (error) {
      sendWebError(res, error);
    }
  },
);

webController.get(
  '/unsubscribe/:token',
  async (req: Request, res: Response) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await unsubscribeByToken({ token });

      res.send(
        renderHtmlMessage(
          'Unsubscribed',
          'You have been successfully unsubscribed.',
        ),
      );
    } catch (error) {
      sendWebError(res, error);
    }
  },
);

export default webController;
