import type { Server as HttpServer } from 'node:http';
import type * as grpc from '@grpc/grpc-js';
import { buildApp } from './composition-root';
import { config } from './config';
import { PinoLogger } from './infrastructure/logging/pino.logger';

const logger = new PinoLogger();
const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer: HttpServer | null = null;
let grpcServer: grpc.Server | null = null;
let isShuttingDown = false;

const shutdownHttp = async (): Promise<void> => {
  if (!httpServer) return;
  await new Promise<void>((resolve, reject) => {
    httpServer?.close((err) => (err ? reject(err) : resolve()));
  });
};

const shutdownGrpc = async (): Promise<void> => {
  if (!grpcServer) return;
  await new Promise<void>((resolve, reject) => {
    grpcServer?.tryShutdown((err) => (err ? reject(err) : resolve()));
  });
};

const bootstrap = async (): Promise<void> => {
  const { httpApp, startGrpcServer, scheduler } = buildApp();

  httpServer = httpApp.listen(config.PORT, () => {
    logger.info(`Server is running on port ${config.PORT}`);
  });
  grpcServer = await startGrpcServer();

  const handle = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    void scheduler.stop();
    const timer = setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing process exit.');
      grpcServer?.forceShutdown();
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    Promise.all([shutdownHttp(), shutdownGrpc()])
      .then(() => {
        clearTimeout(timer);
        logger.info('Graceful shutdown completed.');
        process.exit(0);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
};

bootstrap().catch((err: unknown) => {
  logger.error({ err }, 'Error starting server');
  process.exit(1);
});
