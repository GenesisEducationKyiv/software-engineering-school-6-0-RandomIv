import path from 'node:path';
import express, { Application, Router } from 'express';
import {
  SubscriptionRestController,
  createSubscriptionApiRouter,
} from './modules/subscription/controllers/subscription.rest.controller';
import {
  SubscriptionWebController,
  createSubscriptionWebRouter,
} from './modules/subscription/controllers/subscription.web.controller';
import { errorHandler } from './common/middlewares/error.middleware';
import { NotFoundError } from './common/errors';
import {
  initPrometheusMetrics,
  prometheusMetricsHandler,
  prometheusMetricsMiddleware,
} from './core/metrics/prometheus';
import { requireApiKey } from './common/middlewares/api-key.middleware';

export interface AppDependencies {
  apiController: SubscriptionRestController;
  webController: SubscriptionWebController;
}

export const createApp = ({
  apiController,
  webController,
}: AppDependencies): Application => {
  const app: Application = express();
  initPrometheusMetrics();

  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', requireApiKey, prometheusMetricsHandler);

  const subscriptionApiRouter = createSubscriptionApiRouter(apiController);
  const subscriptionWebRouter = createSubscriptionWebRouter(webController);

  const apiRouter = Router();
  apiRouter.use(prometheusMetricsMiddleware);
  apiRouter.use(requireApiKey);
  apiRouter.use('/', subscriptionApiRouter);

  app.use('/api', apiRouter);
  app.use('/web', subscriptionWebRouter);

  app.use((req, res, next) => {
    next(new NotFoundError('API route not found'));
  });

  app.use(errorHandler);

  return app;
};
