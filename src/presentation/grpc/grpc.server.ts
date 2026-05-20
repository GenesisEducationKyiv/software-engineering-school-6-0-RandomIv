import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { LoggerPort } from '../../application/ports/logger.port';
import { SubscriptionController } from '../http/controllers/subscription.controller';
import { GrpcExceptionTranslatorRegistry } from './error-translators/grpc-exception-translator.registry';
import { buildReleaseNotifierHandlers } from './grpc.handlers';
import type {
  LoadedGrpcObject,
  ReleaseNotifierGrpcPackage,
} from './grpc.types';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/release_notifier.proto');
const LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const loadPackage = (): ReleaseNotifierGrpcPackage => {
  const definition = protoLoader.loadSync(PROTO_PATH, LOADER_OPTIONS);
  const grpcObject = grpc.loadPackageDefinition(definition) as LoadedGrpcObject;
  if (!grpcObject.release_notifier?.ReleaseNotifier?.service) {
    throw new Error(
      'Failed to load gRPC package release_notifier.ReleaseNotifier',
    );
  }
  return grpcObject.release_notifier as unknown as ReleaseNotifierGrpcPackage;
};

export interface BuildGrpcServerDeps {
  subscriptionController: SubscriptionController;
  errorRegistry: GrpcExceptionTranslatorRegistry;
  apiKey: string;
  logger: LoggerPort;
  host: string;
  port: number;
}

export const buildGrpcServer = async (
  deps: BuildGrpcServerDeps,
): Promise<grpc.Server> => {
  const pkg = loadPackage();
  const server = new grpc.Server();

  server.addService(
    pkg.ReleaseNotifier.service,
    buildReleaseNotifierHandlers({
      controller: deps.subscriptionController,
      errors: deps.errorRegistry,
      apiKey: deps.apiKey,
    }),
  );

  const address = `${deps.host}:${deps.port}`;

  await new Promise<void>((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => {
        if (error) {
          reject(error);
          return;
        }
        deps.logger.info(`gRPC server is running on ${deps.host}:${port}`);
        resolve();
      },
    );
  });

  return server;
};
