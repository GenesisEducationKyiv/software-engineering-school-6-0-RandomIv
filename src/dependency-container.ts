import prisma from './core/db/db';
import { config } from './config';
import { PrismaRepositoryRepository } from './modules/repository/repository.repository';
import { ScannerService } from './modules/scanner/scanner.service';
import { SubscriptionService } from './modules/subscription/subscription.service';
import { PrismaSubscriptionRepository } from './modules/subscription/subscription.repository';
import { MqNotificationProvider } from './modules/notification/rabbitmq/rabbitmq.provider';
import { ReleaseCheckScheduler } from './schedulers/release-check.scheduler';
import { ReleaseNotifierHandlers } from './core/grpc/grpc.types';

import { SubscriptionRestController } from './modules/subscription/controllers/subscription.rest.controller';
import { SubscriptionWebController } from './modules/subscription/controllers/subscription.web.controller';
import {
  SubscriptionGrpcController,
  createSubscriptionGrpcHandlers,
} from './modules/subscription/controllers/subscription.grpc.controller';

import { GithubRepositoryProvider } from './modules/subscription/providers/github-repository.provider';
import { GithubReleaseProvider } from './modules/scanner/providers/github-release.provider';

import { cacheService } from './core/cache/cache.service';
import { HttpGitHubClient } from './integrations/github/http-github.client';
import { CachedGitHubClient } from './integrations/github/cached-github.client';
import { GitHubService } from './integrations/github/github.service';

export interface DependencyContainer {
  apiController: SubscriptionRestController;
  webController: SubscriptionWebController;
  grpcHandlers: ReleaseNotifierHandlers;
  scheduler: ReleaseCheckScheduler;
}

export const createDependencyContainer = (): DependencyContainer => {
  const appBaseUrl = config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;

  const notificationPort = new MqNotificationProvider(config.RABBITMQ_URL);

  const repositoryRepository = new PrismaRepositoryRepository(prisma);
  const subscriptionRepository = new PrismaSubscriptionRepository(prisma);

  const pureHttpGitHubClient = new HttpGitHubClient();
  const cachedGitHubClient = new CachedGitHubClient(
    pureHttpGitHubClient,
    cacheService,
  );
  const githubService = new GitHubService(cachedGitHubClient);

  const repositoryProvider = new GithubRepositoryProvider(githubService);
  const releaseProvider = new GithubReleaseProvider(githubService);

  const subscriptionService = new SubscriptionService(
    subscriptionRepository,
    repositoryProvider,
    repositoryRepository,
    notificationPort,
    appBaseUrl,
  );

  const scannerService = new ScannerService(
    releaseProvider,
    notificationPort,
    repositoryRepository,
    appBaseUrl,
  );

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
