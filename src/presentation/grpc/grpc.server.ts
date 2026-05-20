import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { LoggerPort } from '../../application/ports/logger.port';
import { SubscribeUseCase } from '../../application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from '../../application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../../application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from '../../application/subscription/list-subscriptions.use-case';
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
  subscribe: SubscribeUseCase;
  confirm: ConfirmSubscriptionUseCase;
  unsubscribe: UnsubscribeUseCase;
  list: ListSubscriptionsUseCase;
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
      subscribe: deps.subscribe,
      confirm: deps.confirm,
      unsubscribe: deps.unsubscribe,
      list: deps.list,
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
