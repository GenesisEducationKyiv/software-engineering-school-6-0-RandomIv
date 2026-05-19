import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { logger } from '../logger';
import { config } from '../../config';
import type {
  LoadedGrpcObject,
  ReleaseNotifierGrpcPackage,
  ReleaseNotifierHandlers,
} from './grpc.types';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/release_notifier.proto');

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const loadReleaseNotifierPackage = (): ReleaseNotifierGrpcPackage => {
  const packageDefinition = protoLoader.loadSync(
    PROTO_PATH,
    PROTO_LOADER_OPTIONS,
  );
  const grpcObject = grpc.loadPackageDefinition(
    packageDefinition,
  ) as LoadedGrpcObject;

  if (!grpcObject.release_notifier?.ReleaseNotifier?.service) {
    throw new Error(
      'Failed to load gRPC package release_notifier.ReleaseNotifier',
    );
  }

  return grpcObject.release_notifier as unknown as ReleaseNotifierGrpcPackage;
};

export const startGrpcServer = async (
  handlers: ReleaseNotifierHandlers,
): Promise<grpc.Server> => {
  const grpcPackage = loadReleaseNotifierPackage();
  const server = new grpc.Server();

  server.addService(grpcPackage.ReleaseNotifier.service, handlers);

  const address = `${config.GRPC_HOST}:${config.GRPC_PORT}`;

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          reject(error);
          return;
        }

        logger.info(`gRPC server is running on ${config.GRPC_HOST}:${port}`);
        resolve();
      },
    );
  });

  return server;
};
