import { Router } from 'express';
import { SubscriptionApiController } from './subscription.api.controller';
import { SubscriptionWebController } from './subscription.web.controller';
import { webSubscribeLimiter } from '../../common/middlewares/rate-limit.middleware';

export const createSubscriptionApiRouter = (
  controller: SubscriptionApiController,
): Router => {
  const router = Router();
  router.post('/subscribe', controller.subscribe);
  router.get('/confirm/:token', controller.confirm);
  router.get('/unsubscribe/:token', controller.unsubscribe);
  router.get('/subscriptions', controller.getSubscriptions);
  return router;
};

export const createSubscriptionWebRouter = (
  controller: SubscriptionWebController,
): Router => {
  const router = Router();
  router.post('/subscribe', webSubscribeLimiter, controller.subscribe);
  router.get('/confirm/:token', controller.confirm);
  router.get('/unsubscribe/:token', controller.unsubscribe);
  return router;
};
