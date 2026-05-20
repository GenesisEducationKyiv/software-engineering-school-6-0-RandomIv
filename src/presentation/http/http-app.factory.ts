import path from 'node:path';
import express, { Application } from 'express';
import { SubscriptionController } from './controllers/subscription.controller';
import { ConfirmSubscriptionUseCase } from '../../application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../../application/subscription/unsubscribe.use-case';
import { buildApiRouter } from './api.router';
import { buildWebRouter } from './web.router';
import { buildErrorMiddleware } from './middlewares/error.middleware';
import { buildApiKeyMiddleware } from './middlewares/api-key.middleware';
import { ExceptionTranslatorRegistry } from './error-translators/exception-translator.registry';
import { LoggerPort } from '../../application/ports/logger.port';
import { NotFoundError } from '../../domain/errors';
import {
  initPrometheusMetrics,
  prometheusMetricsHandler,
} from '../../common/metrics/prometheus';

export interface HttpAppDeps {
  subscriptionController: SubscriptionController;
  confirmUseCase: ConfirmSubscriptionUseCase;
  unsubscribeUseCase: UnsubscribeUseCase;
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

  const apiKeyMiddleware = buildApiKeyMiddleware(deps.apiKey);
  app.use('/api', buildApiRouter(deps.subscriptionController, apiKeyMiddleware));
  app.use(
    '/web',
    buildWebRouter(
      deps.subscriptionController,
      deps.confirmUseCase,
      deps.unsubscribeUseCase,
    ),
  );

  app.use((_req, _res, next) => next(new NotFoundError('API route not found')));
  app.use(buildErrorMiddleware(deps.errorRegistry, deps.logger));

  return app;
};
