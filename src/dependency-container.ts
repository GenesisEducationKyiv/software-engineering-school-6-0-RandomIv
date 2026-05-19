import prisma from './core/db/db';
import nodemailer from 'nodemailer';
import { config } from './config';
import { githubHttpClient } from './integrations/github/github.http-client';
import { GitHubApiService } from './integrations/github/github.service';
import { NodemailerService } from './integrations/email/email.service';
import { PrismaRepositoryRepository } from './modules/repository/repository.repository';
import {
  ReleaseScannerService,
  ScannerService,
} from './modules/scanner/scanner.service';
import {
  SubscriptionApplicationService,
  SubscriptionService,
} from './modules/subscription/subscription.service';
import { PrismaSubscriptionRepository } from './modules/subscription/subscription.repository';

export interface DependencyContainer {
  subscriptionService: SubscriptionService;
  scannerService: ScannerService;
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

  const scannerService = new ReleaseScannerService({
    releaseProvider: githubApiService,
    emailService,
    repositoryRepository,
    appBaseUrl,
  });

  return {
    subscriptionService,
    scannerService,
  };
};
