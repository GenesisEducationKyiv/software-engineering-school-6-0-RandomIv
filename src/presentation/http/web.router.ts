import { Router, Request, Response } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { ConfirmSubscriptionUseCase } from '../../application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../../application/subscription/unsubscribe.use-case';
import { webSubscribeLimiter } from './middlewares/rate-limit.middleware';
import { renderHtmlMessage } from './views/html.template';
import { sendWebError } from './utils/web-error.util';
import { tokenParamSchema } from './dto/subscription.schema';

export const buildWebRouter = (
  controller: SubscriptionController,
  confirm: ConfirmSubscriptionUseCase,
  unsubscribe: UnsubscribeUseCase,
): Router => {
  const router = Router();

  router.post('/subscribe', webSubscribeLimiter, controller.subscribeHandler);

  router.get('/confirm/:token', async (req: Request, res: Response) => {
    try {
      const { token } = tokenParamSchema.parse(req.params);
      await confirm.execute({ token });
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
      await unsubscribe.execute({ token });
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
