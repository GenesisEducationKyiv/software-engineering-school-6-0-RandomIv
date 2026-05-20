import type { Application } from 'express';
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

import { InMemorySubscriptionRepository } from './fakes/in-memory-subscription.repository';
import { InMemoryRepositoryRepository } from './fakes/in-memory-repository.repository';
import { FakeGitHubClient } from './fakes/fake-github.client';
import { FakeEmailSender } from './fakes/fake-email.sender';
import { SilentLogger } from './fakes/silent.logger';
import { ConfirmationEmailTemplate } from '../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../src/infrastructure/email/app-url-builder';

export interface TestComposition {
  app: Application;
  controller: SubscriptionController;
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
  const apiKey = overrides.apiKey ?? 'test-key';

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

  const app = buildHttpApp({
    subscriptionController: controller,
    errorRegistry,
    apiKey,
    logger,
  });

  return { app, controller, subscriptions, repositories, github, email, apiKey };
};
