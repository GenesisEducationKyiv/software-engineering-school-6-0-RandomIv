import { Router, Request, Response } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { webSubscribeLimiter } from './middlewares/rate-limit.middleware';
import { renderHtmlMessage } from './views/html.template';
import { sendWebError } from './utils/web-error.util';
import { tokenParamSchema } from '../../modules/subscription/subscription.schema';

export const buildWebRouter = (controller: SubscriptionController): Router => {
  const router = Router();

  router.post('/subscribe', webSubscribeLimiter, controller.subscribeHandler);

  router.get('/confirm/:token', async (req: Request, res: Response) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await controller.useCases.confirm.execute({ token });
      res.send(
        renderHtmlMessage(
          'Confirmed',
          'Your subscription has been confirmed successfully.',
        ),
      );
    } catch (error) {
      sendWebError(res, error);
    }
  });

  router.get('/unsubscribe/:token', async (req: Request, res: Response) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await controller.useCases.unsubscribe.execute({ token });
      res.send(
        renderHtmlMessage(
          'Unsubscribed',
          'You have been successfully unsubscribed.',
        ),
      );
    } catch (error) {
      sendWebError(res, error);
    }
  });

  return router;
};
