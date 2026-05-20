import path from 'node:path';
import express, { Application } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { buildApiRouter } from './api.router';
import { buildWebRouter } from './web.router';
import { buildErrorMiddleware } from './middlewares/error.middleware';
import { ExceptionTranslatorRegistry } from './error-translators/exception-translator.registry';
import { LoggerPort } from '../../application/ports/logger.port';
import { NotFoundError } from '../../domain/errors';
import {
  initPrometheusMetrics,
  prometheusMetricsHandler,
} from '../../common/metrics/prometheus';

export interface HttpAppDeps {
  subscriptionController: SubscriptionController;
  errorRegistry: ExceptionTranslatorRegistry;
  apiKey: string;
  logger: LoggerPort;
}

export const buildHttpApp = (deps: HttpAppDeps): Application => {
  initPrometheusMetrics();
  const app: Application = express();
  app.use(express.json());
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.get('/metrics', prometheusMetricsHandler);

  app.use('/api', buildApiRouter(deps.subscriptionController));
  app.use('/web', buildWebRouter(deps.subscriptionController));

  app.use((_req, _res, next) => next(new NotFoundError('API route not found')));
  app.use(buildErrorMiddleware(deps.errorRegistry, deps.logger));

  return app;
};
