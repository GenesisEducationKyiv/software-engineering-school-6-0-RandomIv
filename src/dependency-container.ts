import prisma from './core/db/db';
import nodemailer from 'nodemailer';
import { config } from './config';
import { githubHttpClient } from './integrations/github/github.http-client';
import { GitHubApiService } from './integrations/github/github.service';
import { NodemailerService } from './integrations/email/email.service';
import { PrismaRepositoryRepository } from './modules/repository/repository.repository';
import { ScannerService } from './modules/scanner/scanner.service';
import { SubscriptionApplicationService } from './modules/subscription/subscription.service';
import { PrismaSubscriptionRepository } from './modules/subscription/subscription.repository';
import { ReleaseCheckScheduler } from './scheduler/release-check.scheduler';
import {
  SubscriptionGrpcController,
  createSubscriptionGrpcHandlers,
} from './modules/subscription/controllers/subscription.grpc.controller';
import { ReleaseNotifierHandlers } from './core/grpc/grpc.types';
import { SubscriptionRestController } from './modules/subscription/controllers/subscription.rest.controller';
import { SubscriptionWebController } from './modules/subscription/controllers/subscription.web.controller';

export interface DependencyContainer {
  apiController: SubscriptionRestController;
  webController: SubscriptionWebController;
  grpcHandlers: ReleaseNotifierHandlers;
  scheduler: ReleaseCheckScheduler;
}

export const createDependencyContainer = (): DependencyContainer => {
  const githubApiService = new GitHubApiService(githubHttpClient);

  const emailService = new NodemailerService({
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS,
      },
    }),
    emailUser: config.EMAIL_USER,
  });

  const appBaseUrl = config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;

  const repositoryRepository = new PrismaRepositoryRepository(prisma);
  const subscriptionRepository = new PrismaSubscriptionRepository(prisma);

  const subscriptionService = new SubscriptionApplicationService({
    subscriptionRepository,
    repositoryProvider: githubApiService,
    repositoryRepository,
    emailService,
    appBaseUrl,
  });

  const scannerService = new ScannerService({
    releaseProvider: githubApiService,
    emailService,
    repositoryRepository,
    appBaseUrl,
  });

  const apiController = new SubscriptionRestController(subscriptionService);
  const webController = new SubscriptionWebController(subscriptionService);

  const grpcController = new SubscriptionGrpcController(
    subscriptionService,
    config.API_KEY,
  );

  const grpcHandlers = createSubscriptionGrpcHandlers(grpcController);

  const scheduler = new ReleaseCheckScheduler(
    scannerService,
    config.RELEASE_CHECK_CRON,
  );

  return {
    apiController,
    webController,
    grpcHandlers,
    scheduler,
  };
};
