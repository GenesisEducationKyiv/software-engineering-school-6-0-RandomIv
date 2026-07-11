import type { Server as HttpServer } from 'node:http';
import type { ScheduledTask } from 'node-cron';
import type * as grpc from '@grpc/grpc-js';
import type amqp from 'amqplib';
import { createApp } from './app';
import { config } from './config';
import { logger } from './core/logger';
import {
  createDependencyContainer,
  type DependencyContainer,
} from './dependency-container';
import { startGrpcServer } from './core/grpc/grpc.server';
import { RabbitConsumer } from './core/rabbitmq/rabbit-consumer';
import {
  SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE,
  type SubscriptionNotificationEvent,
} from './modules/notification/rabbitmq/saga/saga.contract';

const PORT = config.PORT;
const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer: HttpServer | null = null;
let grpcServer: grpc.Server | null = null;
let releaseCheckTask: ScheduledTask | null = null;
let sagaEventsModel: amqp.RecoveringChannelModel | null = null;
let dependencyContainer: DependencyContainer | null = null;
let isShuttingDown = false;

const shutdownHttpServer = async (): Promise<void> => {
  if (!httpServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    httpServer?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const shutdownGrpcServer = async (): Promise<void> => {
  if (!grpcServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    grpcServer?.tryShutdown((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const shutdownSagaConsumer = async (): Promise<void> => {
  if (!sagaEventsModel) {
    return;
  }

  await sagaEventsModel.close();
};

const shutdownReleaseNotificationProvider = (): void => {
  dependencyContainer?.releaseNotificationProvider.close();
};

const setupGracefulShutdown = (): void => {
  const handleShutdownSignal = async (
    signal: NodeJS.Signals,
  ): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    if (releaseCheckTask) {
      void releaseCheckTask.stop();
    }

    shutdownReleaseNotificationProvider();

    const forceShutdownTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      grpcServer?.forceShutdown();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceShutdownTimer.unref();

    try {
      await Promise.all([
        shutdownHttpServer(),
        shutdownGrpcServer(),
        shutdownSagaConsumer(),
      ]);
      clearTimeout(forceShutdownTimer);
      logger.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceShutdownTimer);
      logger.error({ err: error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void handleShutdownSignal('SIGTERM');
  });

  process.on('SIGINT', () => {
    void handleShutdownSignal('SIGINT');
  });
};

const bootstrap = async (): Promise<void> => {
  setupGracefulShutdown();

  dependencyContainer = createDependencyContainer();

  const app = createApp({
    apiController: dependencyContainer.apiController,
    webController: dependencyContainer.webController,
  });

  httpServer = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  grpcServer = await startGrpcServer(dependencyContainer.grpcHandlers);

  releaseCheckTask = dependencyContainer.scheduler.start();

  const sagaEventsConsumer = new RabbitConsumer<SubscriptionNotificationEvent>(
    config.RABBITMQ_URL,
    SUBSCRIPTION_NOTIFICATION_EVENTS_QUEUE,
    dependencyContainer.subscriptionSagaOrchestrator,
  );
  sagaEventsModel = await sagaEventsConsumer.start();
};

bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'Error starting server');
  process.exit(1);
});
