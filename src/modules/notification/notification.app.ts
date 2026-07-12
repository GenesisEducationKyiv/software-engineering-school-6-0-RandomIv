import express, { Application } from 'express';
import { errorHandler } from '../../common/middlewares/error.middleware';
import { NotFoundError } from '../../common/errors';
import {
  NotificationRestController,
  createNotificationRouter,
} from './controllers/notification.rest.controller';
import { createInternalAuth } from './middlewares/internal-auth.middleware';

export interface NotificationAppDependencies {
  controller: NotificationRestController;
  apiKey: string;
}

export const createNotificationApp = ({
  controller,
  apiKey,
}: NotificationAppDependencies): Application => {
  const app = express();

  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(createInternalAuth(apiKey));
  app.use(createNotificationRouter(controller));

  app.use((_req, _res, next) => {
    next(new NotFoundError('Notification route not found'));
  });

  app.use(errorHandler);

  return app;
};
