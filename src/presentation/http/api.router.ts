import { Router, RequestHandler } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { prometheusMetricsMiddleware } from '../../common/metrics/prometheus';

export const buildApiRouter = (
  controller: SubscriptionController,
  apiKeyMiddleware: RequestHandler,
): Router => {
  const router = Router();
  router.use(prometheusMetricsMiddleware);
  router.use(apiKeyMiddleware);
  router.post('/subscribe', controller.subscribeHandler);
  router.get('/confirm/:token', controller.confirmHandler);
  router.get('/unsubscribe/:token', controller.unsubscribeHandler);
  router.get('/subscriptions', controller.listHandler);
  return router;
};
