import prisma from './common/utils/db';
import nodemailer from 'nodemailer';
import { config } from './config';
import { githubHttpClient } from './modules/github/github.utils';
import { GitHubApiService } from './modules/github/github.service';
import { NodemailerService } from './modules/notification/email.service';
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
  const githubService = new GitHubApiService(githubHttpClient);
  const emailService = new NodemailerService({
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.EMAIL_USER,
        pass: config.EMAIL_PASS,
      },
    }),
    emailUser: config.EMAIL_USER,
    appBaseUrl: config.APP_BASE_URL ?? `http://localhost:${config.PORT}`,
  });
  const repositoryService = new PrismaRepositoryRepository(prisma);
  const subscriptionRepository = new PrismaSubscriptionRepository(prisma);
  const subscriptionService = new SubscriptionApplicationService({
    subscriptionRepository,
    githubService,
    repositoryService,
    emailService,
  });
  const scannerService = new ReleaseScannerService({
    githubService,
    emailService,
    repositoryService,
  });

  return {
    subscriptionService,
    scannerService,
  };
};
