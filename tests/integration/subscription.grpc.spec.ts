import { createServer } from 'node:net';
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { config } from '../../src/config';
import { MESSAGES } from '../../src/common/constants/messages.constant';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/release_notifier.proto');
const API_KEY_METADATA_KEY = 'x-api-key';

const withApiKey = (): grpc.Metadata => {
  const metadata = new grpc.Metadata();
  metadata.set(API_KEY_METADATA_KEY, config.API_KEY);
  return metadata;
};

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
      (
        error: grpc.ServiceError | null,
        response: TResponse | null | undefined,
      ) => {
        resolve({ error, response });
      },
    ]);
  });
};

describe('gRPC integration', () => {
  let grpcServer: grpc.Server | null = null;
  let grpcClient: grpc.Client | null = null;
  let NodemailerServiceRef: typeof import('../../src/integrations/email/email.service').NodemailerService;
  let prisma: typeof import('../../src/core/db/db').default;

  beforeAll(async () => {
    const grpcPort = await getFreePort();
    process.env.GRPC_HOST = '127.0.0.1';
    process.env.GRPC_PORT = String(grpcPort);

    jest.resetModules();
    const [
      { startGrpcServer },
      { createDependencyContainer },
      { NodemailerService },
      { default: db },
    ] = await Promise.all([
      import('../../src/core/grpc/grpc.server'),
      import('../../src/dependency-container'),
      import('../../src/integrations/email/email.service'),
      import('../../src/core/db/db'),
    ]);
    NodemailerServiceRef = NodemailerService;
    prisma = db;
    const container = createDependencyContainer();
    grpcServer = await startGrpcServer(container.grpcHandlers);

    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const grpcObject = grpc.loadPackageDefinition(
      packageDefinition,
    ) as grpc.GrpcObject;
    const releaseNotifierPackage =
      grpcObject.release_notifier as grpc.GrpcObject;
    const ClientConstructor =
      releaseNotifierPackage.ReleaseNotifier as grpc.ServiceClientConstructor;

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

    await prisma.$disconnect();
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

  it('creates a subscription via Subscribe rpc', async () => {
    if (!grpcClient) {
      throw new Error('gRPC client is not initialized');
    }

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const emailSpy = jest
      .spyOn(
        NodemailerServiceRef.prototype,
        'sendSubscriptionConfirmationEmail',
      )
      .mockResolvedValue();

    const { error, response } = await callUnary<{ message: string }>(
      grpcClient,
      'Subscribe',
      { email: 'grpc-subscribe@example.com', repo: 'owner/repo' },
      withApiKey(),
    );

    expect(error).toBeNull();
    expect(response?.message).toBe(MESSAGES.SUBSCRIBE_SUCCESS);
    expect(emailSpy).toHaveBeenCalled();

    const subscription = await prisma.subscription.findFirst({
      where: { email: 'grpc-subscribe@example.com' },
    });
    expect(subscription).not.toBeNull();
  });

  it('confirms a subscription via Confirm rpc', async () => {
    if (!grpcClient) {
      throw new Error('gRPC client is not initialized');
    }

    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: { email: 'grpc-confirm@example.com', repositoryId: repository.id },
    });

    const { error, response } = await callUnary<{ message: string }>(
      grpcClient,
      'Confirm',
      { token: subscription.confirmationToken },
      withApiKey(),
    );

    expect(error).toBeNull();
    expect(response?.message).toBe(MESSAGES.CONFIRM_SUCCESS);

    const confirmed = await prisma.subscription.findUnique({
      where: { id: subscription.id },
    });
    expect(confirmed?.confirmed).toBe(true);
  });

  it('deletes a subscription via Unsubscribe rpc', async () => {
    if (!grpcClient) {
      throw new Error('gRPC client is not initialized');
    }

    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    const subscription = await prisma.subscription.create({
      data: {
        email: 'grpc-unsubscribe@example.com',
        repositoryId: repository.id,
      },
    });

    const { error, response } = await callUnary<{ message: string }>(
      grpcClient,
      'Unsubscribe',
      { token: subscription.unsubscribeToken },
      withApiKey(),
    );

    expect(error).toBeNull();
    expect(response?.message).toBe(MESSAGES.UNSUBSCRIBE_SUCCESS);

    const deleted = await prisma.subscription.findUnique({
      where: { id: subscription.id },
    });
    expect(deleted).toBeNull();
  });
});
