import 'dotenv/config';
import type { Server } from 'node:http';
import express from 'express';
import nodemailer from 'nodemailer';
import { emailSchema } from './config/email.config';
import { notificationServiceSchema } from './config/notification.config';
import { NodemailerService } from './integrations/email/email.service';
import { NodemailerEmailProvider } from './integrations/email/nodemailer-email.provider';
import { EmailNotificationProvider } from './modules/notification/delivery/email.provider';
import {
  NotificationRestController,
  createNotificationRouter,
} from './modules/notification/rest/rest.controller';
import { startMqConsumer } from './modules/notification/rabbitmq/rabbitmq.consumer';
import { startSubscriptionSagaCommandConsumer } from './modules/notification/saga/subscription-saga.consumer';
import { logger } from './core/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const bootstrap = async (): Promise<void> => {
  const configSchema = emailSchema.extend(notificationServiceSchema.shape);
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    logger.error(
      'Invalid or missing environment variables for notification service',
    );
    process.exit(1);
  }
  const config = parsed.data;

  const transporter = nodemailer.createTransport(
    config.SMTP_HOST
      ? {
          host: config.SMTP_HOST,
          port: config.SMTP_PORT ?? 1025,
          secure: config.SMTP_SECURE ?? config.SMTP_PORT === 465,
          auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASS },
        }
      : {
          service: 'gmail',
          auth: { user: config.EMAIL_USER, pass: config.EMAIL_PASS },
        },
  );

  const emailTransport = new NodemailerEmailProvider(transporter);
  const emailService = new NodemailerService(emailTransport, config.EMAIL_USER);
  const channel = new EmailNotificationProvider(emailService);
  const controller = new NotificationRestController(channel);

  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(createNotificationRouter(controller));

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(config.NOTIFICATION_PORT, () => {
      logger.info(
        `Notification service running on port ${config.NOTIFICATION_PORT}`,
      );
      resolve(s);
    });
  });

  const mqModel = await startMqConsumer(config.RABBITMQ_URL, channel);
  const sagaCommandsModel = await startSubscriptionSagaCommandConsumer(
    config.RABBITMQ_URL,
    channel,
  );

  let isShuttingDown = false;

  const shutdown = async (): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Shutting down notification service...');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await Promise.all([
        new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve())),
        ),
        mqModel.close(),
        sagaCommandsModel.close(),
      ]);
      clearTimeout(forceExit);
      logger.info('Notification service stopped.');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExit);
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
};

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'Failed to start notification service');
  process.exit(1);
});
