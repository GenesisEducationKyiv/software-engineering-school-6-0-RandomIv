import prisma from './core/db/db';
import { config } from './config';
import { PrismaRepositoryRepository } from './modules/repository/repository.repository';
import { ScannerService } from './modules/scanner/scanner.service';
import { SubscriptionService } from './modules/subscription/subscription.service';
import { PrismaSubscriptionRepository } from './modules/subscription/subscription.repository';
import { SubscriptionSagaOrchestrator } from './modules/subscription/saga/subscription-saga.orchestrator';
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

import { RabbitMessagePublisher } from './core/rabbitmq/rabbit-publisher';
import { RabbitMqProvider } from './modules/notification/rabbitmq/rabbitmq.provider';
import { SagaConfirmationProvider } from './modules/notification/rabbitmq/saga/saga.provider';
import { NOTIFICATION_QUEUE } from './modules/notification/rabbitmq/rabbitmq.contract';
import type { NotificationMessage } from './modules/notification/rabbitmq/rabbitmq.contract';
import {
  SEND_CONFIRMATION_COMMAND_QUEUE,
  type SendConfirmationCommand,
} from './modules/notification/rabbitmq/saga/saga.contract';

export interface DependencyContainer {
  apiController: SubscriptionRestController;
  webController: SubscriptionWebController;
  grpcHandlers: ReleaseNotifierHandlers;
  scheduler: ReleaseCheckScheduler;
  subscriptionSagaOrchestrator: SubscriptionSagaOrchestrator;
}

export const createDependencyContainer = (): DependencyContainer => {
  const appBaseUrl = config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;

  const plainPublisher = new RabbitMessagePublisher<NotificationMessage>(
    config.RABBITMQ_URL,
    NOTIFICATION_QUEUE,
  );
  const sagaPublisher = new RabbitMessagePublisher<SendConfirmationCommand>(
    config.RABBITMQ_URL,
    SEND_CONFIRMATION_COMMAND_QUEUE,
  );

  const rabbitMqProvider = new RabbitMqProvider(plainPublisher);
  const sagaConfirmationProvider = new SagaConfirmationProvider(sagaPublisher);

  // Варіант А (без Саги): const confirmationPort = rabbitMqProvider;
  // Варіант Б (із Сагою):
  const confirmationPort = sagaConfirmationProvider;

  const repositoryRepository = new PrismaRepositoryRepository(prisma);
  const subscriptionRepository = new PrismaSubscriptionRepository(prisma);

  const subscriptionSagaOrchestrator = new SubscriptionSagaOrchestrator(
    subscriptionRepository,
  );

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
    confirmationPort,
    appBaseUrl,
  );

  const scannerService = new ScannerService(
    releaseProvider,
    rabbitMqProvider,
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
    subscriptionSagaOrchestrator,
  };
};
