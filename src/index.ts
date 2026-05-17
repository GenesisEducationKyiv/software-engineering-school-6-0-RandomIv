import type { Server as HttpServer } from 'node:http';
import type { ScheduledTask } from 'node-cron';
import type * as grpc from '@grpc/grpc-js';
import app from './app';
import { config } from './config';
import { pinoLogger } from './common/logger/pino.logger';
import { initReleaseCheckJob } from './jobs/release-check.job';
import { startGrpcServer } from './modules/grpc/grpc.server';

const PORT = config.PORT;
const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer: HttpServer | null = null;
let grpcServer: grpc.Server | null = null;
let releaseCheckTask: ScheduledTask | null = null;
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

const setupGracefulShutdown = (): void => {
  const handleShutdownSignal = async (
    signal: NodeJS.Signals,
  ): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    pinoLogger.info(`Received ${signal}. Starting graceful shutdown...`);

    if (releaseCheckTask) {
      void releaseCheckTask.stop();
    }

    const forceShutdownTimer = setTimeout(() => {
      pinoLogger.error('Graceful shutdown timed out. Forcing process exit.');
      grpcServer?.forceShutdown();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceShutdownTimer.unref();

    try {
      await Promise.all([shutdownHttpServer(), shutdownGrpcServer()]);
      clearTimeout(forceShutdownTimer);
      pinoLogger.info('Graceful shutdown completed.');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceShutdownTimer);
      pinoLogger.error({ err: error }, 'Error during graceful shutdown');
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
  httpServer = app.listen(PORT, () => {
    pinoLogger.info(`Server is running on port ${PORT}`);
  });
  grpcServer = await startGrpcServer();
  releaseCheckTask = initReleaseCheckJob();
  setupGracefulShutdown();
};

bootstrap().catch((error: unknown) => {
  pinoLogger.error({ err: error }, 'Error starting server');
  process.exit(1);
});
