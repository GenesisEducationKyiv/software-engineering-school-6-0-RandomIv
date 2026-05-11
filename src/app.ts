import path from 'node:path';
import express, { Application } from 'express';
import {
  createSubscriptionApiController,
} from './modules/subscription/subscription.api.controller';
import {
  createSubscriptionWebController,
} from './modules/subscription/subscription.web.controller';
import { errorHandler } from './common/middlewares/error.middleware';
import { NotFoundError } from './common/errors';
import {
  initPrometheusMetrics,
  prometheusMetricsHandler,
  prometheusMetricsMiddleware,
} from './common/metrics/prometheus';
import { requireApiKey } from './common/middlewares/api-key.middleware';
import { SubscriptionService } from './modules/subscription/subscription.service';

export interface AppDependencies {
  subscriptionService: SubscriptionService;
}

export const createApp = ({ subscriptionService }: AppDependencies): Application => {
  const app: Application = express();
  initPrometheusMetrics();

  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', prometheusMetricsHandler);

  const apiRouter = express.Router();
  const subscriptionApiController =
    createSubscriptionApiController(subscriptionService);
  const webSubscriptionController =
    createSubscriptionWebController(subscriptionService);

  apiRouter.use(prometheusMetricsMiddleware);
  apiRouter.use(requireApiKey);
  apiRouter.use('/', subscriptionApiController);

  app.use('/api', apiRouter);
  app.use('/web', webSubscriptionController);

  app.use((req, res, next) => {
    next(new NotFoundError('API route not found'));
  });

  app.use(errorHandler);

  return app;
};
