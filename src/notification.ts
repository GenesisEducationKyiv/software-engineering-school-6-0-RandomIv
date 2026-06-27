import 'dotenv/config';
import express from 'express';
import nodemailer from 'nodemailer';
import { emailSchema } from './config/email.config';
import { notificationServiceSchema } from './config/notification.config';
import { NodemailerService } from './integrations/email/email.service';
import { NodemailerEmailProvider } from './integrations/email/nodemailer-email.provider';
import { EmailNotificationProvider } from './modules/notification/providers/email-notification.provider';
import {
  NotificationRestController,
  createNotificationRouter,
} from './modules/notification/controllers/notification.rest.controller';
import { logger } from './core/logger';

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

app.listen(config.NOTIFICATION_PORT, () => {
  logger.info(
    `Notification service running on port ${config.NOTIFICATION_PORT}`,
  );
});
