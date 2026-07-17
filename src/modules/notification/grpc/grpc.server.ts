import * as grpc from '@grpc/grpc-js';
import { NotificationServiceService } from '../../../generated/notification/v1/notification';
import { logger } from '../../../core/logger';
import type { NotificationGrpcHandlers } from './notification.grpc.controller';

export const startNotificationGrpcServer = async (
  handlers: NotificationGrpcHandlers,
  host: string,
  port: number,
): Promise<grpc.Server> => {
  const server = new grpc.Server();

  server.addService(NotificationServiceService, handlers);

  const address = `${host}:${port}`;

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error, boundPort) => {
        if (error) {
          reject(error);
          return;
        }

        logger.info(
          `Notification gRPC server is running on ${host}:${boundPort}`,
        );
        resolve();
      },
    );
  });

  return server;
};
