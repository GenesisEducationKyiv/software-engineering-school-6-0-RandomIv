import path from 'node:path';
import express, { Application } from 'express';
import subscriptionApiController from './modules/subscription/subscription.api.controller';
import webSubscriptionController from './modules/subscription/subscription.web.controller';
import { errorHandler } from './common/middlewares/error.middleware';
import { NotFoundError } from './common/errors';
import {
  initPrometheusMetrics,
  prometheusMetricsHandler,
  prometheusMetricsMiddleware,
} from './common/metrics/prometheus';
import { requireApiKey } from './common/middlewares/api-key.middleware';

const app: Application = express();

initPrometheusMetrics();

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', prometheusMetricsHandler);

const apiRouter = express.Router();

apiRouter.use(prometheusMetricsMiddleware);
apiRouter.use(requireApiKey);
apiRouter.use('/', subscriptionApiController);

app.use('/api', apiRouter);
app.use('/web', webSubscriptionController);

app.use((req, res, next) => {
  next(new NotFoundError('API route not found'));
});

app.use(errorHandler);

export default app;
