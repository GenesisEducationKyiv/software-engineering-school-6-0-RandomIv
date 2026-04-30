import { createServer } from 'node:net';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/release_notifier.proto');

const getFreePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a free TCP port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
};

const callUnary = <TResponse>(
  client: grpc.Client,
  methodName: string,
  request: Record<string, unknown>,
  metadata = new grpc.Metadata(),
): Promise<{
  error: grpc.ServiceError | null;
  response: TResponse | null | undefined;
}> => {
  return new Promise((resolve) => {
    type GrpcClientMethod = (...args: unknown[]) => unknown;
    const method = (
      client as unknown as Record<string, GrpcClientMethod | undefined>
    )[methodName];
    if (!method) {
      throw new Error(`gRPC method ${methodName} is not available on client`);
    }

    Reflect.apply(method, client, [
      request,
      metadata,
      (error: grpc.ServiceError | null, response: TResponse | null | undefined) => {
        resolve({ error, response });
      },
    ]);
  });
};

describe('gRPC integration', () => {
  let grpcServer: grpc.Server | null = null;
  let grpcClient: grpc.Client | null = null;

  beforeAll(async () => {
    const grpcPort = await getFreePort();
    process.env.GRPC_HOST = '127.0.0.1';
    process.env.GRPC_PORT = String(grpcPort);

    jest.resetModules();
    const { startGrpcServer } = await import('../../src/modules/grpc/grpc.server');
    grpcServer = await startGrpcServer();

    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const grpcObject = grpc.loadPackageDefinition(packageDefinition) as grpc.GrpcObject;
    const releaseNotifierPackage = grpcObject.release_notifier as grpc.GrpcObject;
    const ClientConstructor = releaseNotifierPackage
      .ReleaseNotifier as grpc.ServiceClientConstructor;

    grpcClient = new ClientConstructor(
      `127.0.0.1:${grpcPort}`,
      grpc.credentials.createInsecure(),
    );
  });

  afterAll(async () => {
    if (grpcClient) {
      grpcClient.close();
    }

    if (grpcServer) {
      await new Promise<void>((resolve) => {
        grpcServer?.tryShutdown(() => resolve());
      });
    }
  });

  it('rejects unauthenticated GetSubscriptions call', async () => {
    if (!grpcClient) {
      throw new Error('gRPC client is not initialized');
    }

    const { error } = await callUnary<{ subscriptions: unknown[] }>(
      grpcClient,
      'GetSubscriptions',
      {
        email: 'user@example.com',
      },
    );

    expect(error).toBeDefined();
    expect(error?.code).toBe(grpc.status.UNAUTHENTICATED);
  });
});
