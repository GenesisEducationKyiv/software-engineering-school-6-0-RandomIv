import type { Server as GrpcServer } from '@grpc/grpc-js';
import type { Application } from 'express';
import { config } from './config';

import { createPrismaClient } from './infrastructure/persistence/prisma.client';
import { PrismaSubscriptionRepository } from './infrastructure/persistence/prisma-subscription.repository';
import { PrismaRepositoryRepository } from './infrastructure/persistence/prisma-repository.repository';
import { FetchHttpClient } from './infrastructure/http/fetch.http-client';
import { NoopCache } from './infrastructure/cache/noop.cache';
import { RedisCache } from './infrastructure/cache/redis.cache';
import { PinoLogger } from './infrastructure/logging/pino.logger';
import { AppUrlBuilder } from './infrastructure/email/app-url-builder';
import { ConfirmationEmailTemplate } from './infrastructure/email/templates/confirmation-email.template';
import { ReleaseEmailTemplate } from './infrastructure/email/templates/release-email.template';
import {
  createNodemailerTransport,
  NodemailerEmailSender,
} from './infrastructure/email/nodemailer.sender';
import { GitHubHttpClient } from './infrastructure/github/github-http.client';
import { NodeCronScheduler } from './infrastructure/scheduler/node-cron.scheduler';
import { SchedulerPort } from './application/ports/scheduler.port';

import { SubscribeUseCase } from './application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from './application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from './application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from './application/subscription/list-subscriptions.use-case';
import { NotifyRepositorySubscribersUseCase } from './application/scanner/notify-repository-subscribers.use-case';
import { CheckReleasesUseCase } from './application/scanner/check-releases.use-case';

import { SubscriptionController } from './presentation/http/controllers/subscription.controller';
import { ExceptionTranslatorRegistry } from './presentation/http/error-translators/exception-translator.registry';
import { ZodExceptionTranslator } from './presentation/http/error-translators/zod.translator';
import { PrismaExceptionTranslator } from './presentation/http/error-translators/prisma.translator';
import { AppErrorTranslator } from './presentation/http/error-translators/app-error.translator';
import { FallbackExceptionTranslator } from './presentation/http/error-translators/fallback.translator';
import { WebExceptionTranslatorRegistry } from './presentation/http/error-translators/web-exception-translator.registry';
import { AppErrorWebTranslator } from './presentation/http/error-translators/app-error.web-translator';
import { ZodWebTranslator } from './presentation/http/error-translators/zod.web-translator';
import { FallbackWebTranslator } from './presentation/http/error-translators/fallback.web-translator';
import { buildHttpApp } from './presentation/http/http-app.factory';
import { buildGrpcServer } from './presentation/grpc/grpc.server';
import { GrpcExceptionTranslatorRegistry } from './presentation/grpc/error-translators/grpc-exception-translator.registry';
import { ZodGrpcExceptionTranslator } from './presentation/grpc/error-translators/zod.grpc-translator';
import { AppErrorGrpcTranslator } from './presentation/grpc/error-translators/app-error.grpc-translator';
import { FallbackGrpcExceptionTranslator } from './presentation/grpc/error-translators/fallback.grpc-translator';

export interface BuiltApp {
  httpApp: Application;
  startGrpcServer: () => Promise<GrpcServer>;
  scheduler: SchedulerPort;
}

export const buildApp = (): BuiltApp => {
  // infrastructure
  const logger = new PinoLogger();
  const prisma = createPrismaClient(config.DATABASE_URL);
  const httpClient = new FetchHttpClient();
  const cache = config.REDIS_URL
    ? new RedisCache(config.REDIS_URL, logger)
    : new NoopCache();
  const urls = new AppUrlBuilder(
    config.APP_BASE_URL ?? `http://localhost:${config.PORT}`,
  );
  const transporter = createNodemailerTransport(
    config.EMAIL_USER,
    config.EMAIL_PASS,
  );
  const email = new NodemailerEmailSender(transporter, config.EMAIL_USER);
  const github = new GitHubHttpClient(httpClient, cache, logger, {
    ...(config.GITHUB_TOKEN !== undefined && { token: config.GITHUB_TOKEN }),
    cacheTtlSeconds: config.GITHUB_CACHE_TTL_SECONDS,
  });
  const scheduler = new NodeCronScheduler(config.RELEASE_CHECK_CRON, logger);

  // adapter -> port
  const subscriptions = new PrismaSubscriptionRepository(prisma);
  const repositories = new PrismaRepositoryRepository(prisma);
  const confirmationTpl = new ConfirmationEmailTemplate(urls);
  const releaseTpl = new ReleaseEmailTemplate(urls);

  // application
  const subscribe = new SubscribeUseCase(
    subscriptions,
    repositories,
    github,
    email,
    confirmationTpl,
    logger,
  );
  const confirm = new ConfirmSubscriptionUseCase(subscriptions);
  const unsubscribe = new UnsubscribeUseCase(subscriptions);
  const list = new ListSubscriptionsUseCase(subscriptions);
  const notify = new NotifyRepositorySubscribersUseCase(
    email,
    releaseTpl,
    logger,
  );
  const checkReleases = new CheckReleasesUseCase(
    repositories,
    github,
    notify,
    logger,
  );

  // presentation
  const subscriptionController = new SubscriptionController(
    subscribe,
    confirm,
    unsubscribe,
    list,
  );
  const httpErrorRegistry = new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(config.NODE_ENV === 'development'),
  ]);
  const webErrorRegistry = new WebExceptionTranslatorRegistry([
    new ZodWebTranslator(),
    new AppErrorWebTranslator(),
    new FallbackWebTranslator(),
  ]);
  const grpcErrorRegistry = new GrpcExceptionTranslatorRegistry([
    new ZodGrpcExceptionTranslator(),
    new AppErrorGrpcTranslator(),
    new FallbackGrpcExceptionTranslator(),
  ]);

  const httpApp = buildHttpApp({
    subscriptionController,
    confirmUseCase: confirm,
    unsubscribeUseCase: unsubscribe,
    errorRegistry: httpErrorRegistry,
    webErrorRegistry,
    apiKey: config.API_KEY,
    logger,
  });

  const startGrpcServer = (): Promise<GrpcServer> =>
    buildGrpcServer({
      subscribe,
      confirm,
      unsubscribe,
      list,
      errorRegistry: grpcErrorRegistry,
      apiKey: config.API_KEY,
      logger,
      host: config.GRPC_HOST,
      port: config.GRPC_PORT,
    });

  scheduler.schedule(() => checkReleases.execute());

  return { httpApp, startGrpcServer, scheduler };
};
