import type { Application } from 'express';
import type * as grpc from '@grpc/grpc-js';
import { config } from '../src/config';
import { SubscribeUseCase } from '../src/application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from '../src/application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../src/application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from '../src/application/subscription/list-subscriptions.use-case';
import { SubscriptionController } from '../src/presentation/http/controllers/subscription.controller';
import { buildHttpApp } from '../src/presentation/http/http-app.factory';
import { ExceptionTranslatorRegistry } from '../src/presentation/http/error-translators/exception-translator.registry';
import { ZodExceptionTranslator } from '../src/presentation/http/error-translators/zod.translator';
import { PrismaExceptionTranslator } from '../src/presentation/http/error-translators/prisma.translator';
import { AppErrorTranslator } from '../src/presentation/http/error-translators/app-error.translator';
import { FallbackExceptionTranslator } from '../src/presentation/http/error-translators/fallback.translator';
import { WebExceptionTranslatorRegistry } from '../src/presentation/http/error-translators/web-exception-translator.registry';
import { ZodWebTranslator } from '../src/presentation/http/error-translators/zod.web-translator';
import { AppErrorWebTranslator } from '../src/presentation/http/error-translators/app-error.web-translator';
import { FallbackWebTranslator } from '../src/presentation/http/error-translators/fallback.web-translator';

import { InMemorySubscriptionRepository } from './fakes/in-memory-subscription.repository';
import { InMemoryRepositoryRepository } from './fakes/in-memory-repository.repository';
import { FakeGitHubClient } from './fakes/fake-github.client';
import { FakeEmailSender } from './fakes/fake-email.sender';
import { SilentLogger } from './fakes/silent.logger';
import { ConfirmationEmailTemplate } from '../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../src/infrastructure/email/app-url-builder';
import { GrpcExceptionTranslatorRegistry } from '../src/presentation/grpc/error-translators/grpc-exception-translator.registry';
import { ZodGrpcExceptionTranslator } from '../src/presentation/grpc/error-translators/zod.grpc-translator';
import { AppErrorGrpcTranslator } from '../src/presentation/grpc/error-translators/app-error.grpc-translator';
import { FallbackGrpcExceptionTranslator } from '../src/presentation/grpc/error-translators/fallback.grpc-translator';
import { buildGrpcServer } from '../src/presentation/grpc/grpc.server';

export interface TestComposition {
  app: Application;
  controller: SubscriptionController;
  subscribeUseCase: SubscribeUseCase;
  confirmUseCase: ConfirmSubscriptionUseCase;
  unsubscribeUseCase: UnsubscribeUseCase;
  listUseCase: ListSubscriptionsUseCase;
  subscriptions: InMemorySubscriptionRepository;
  repositories: InMemoryRepositoryRepository;
  github: FakeGitHubClient;
  email: FakeEmailSender;
  apiKey: string;
}

export interface BuildTestAppOverrides {
  github?: FakeGitHubClient;
  email?: FakeEmailSender;
  apiKey?: string;
}

export const buildTestApp = (
  overrides: BuildTestAppOverrides = {},
): TestComposition => {
  const repositories = new InMemoryRepositoryRepository();
  const subscriptions = new InMemorySubscriptionRepository(repositories.byName);
  const github = overrides.github ?? new FakeGitHubClient({ exists: true });
  const email = overrides.email ?? new FakeEmailSender();
  const logger = new SilentLogger();
  const urls = new AppUrlBuilder('http://localhost:3000');
  const tpl = new ConfirmationEmailTemplate(urls);
  const apiKey = overrides.apiKey ?? config.API_KEY;

  const subscribe = new SubscribeUseCase(
    subscriptions,
    repositories,
    github,
    email,
    tpl,
    logger,
  );
  const confirm = new ConfirmSubscriptionUseCase(subscriptions);
  const unsubscribe = new UnsubscribeUseCase(subscriptions);
  const list = new ListSubscriptionsUseCase(subscriptions);
  const controller = new SubscriptionController(
    subscribe,
    confirm,
    unsubscribe,
    list,
  );

  const errorRegistry = new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(false),
  ]);
  const webErrorRegistry = new WebExceptionTranslatorRegistry([
    new ZodWebTranslator(),
    new AppErrorWebTranslator(),
    new FallbackWebTranslator(),
  ]);

  const app = buildHttpApp({
    subscriptionController: controller,
    confirmUseCase: confirm,
    unsubscribeUseCase: unsubscribe,
    errorRegistry,
    webErrorRegistry,
    apiKey,
    logger,
  });

  return {
    app,
    controller,
    subscribeUseCase: subscribe,
    confirmUseCase: confirm,
    unsubscribeUseCase: unsubscribe,
    listUseCase: list,
    subscriptions,
    repositories,
    github,
    email,
    apiKey,
  };
};

export interface BuiltTestGrpcServer {
  server: grpc.Server;
  address: string;
}

export const buildTestGrpcServer = async (
  ctx: TestComposition,
  port: number,
): Promise<BuiltTestGrpcServer> => {
  const errorRegistry = new GrpcExceptionTranslatorRegistry([
    new ZodGrpcExceptionTranslator(),
    new AppErrorGrpcTranslator(),
    new FallbackGrpcExceptionTranslator(),
  ]);

  const server = await buildGrpcServer({
    subscribe: ctx.subscribeUseCase,
    confirm: ctx.confirmUseCase,
    unsubscribe: ctx.unsubscribeUseCase,
    list: ctx.listUseCase,
    errorRegistry,
    apiKey: ctx.apiKey,
    logger: new SilentLogger(),
    host: '127.0.0.1',
    port,
  });

  return { server, address: `127.0.0.1:${port}` };
};
