import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { buildTestApp, buildTestGrpcServer, TestComposition } from '../test-composition';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/release_notifier.proto');
const TEST_GRPC_PORT = 50071;

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

const buildClient = (address: string): grpc.Client => {
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
  const releaseNotifierPackage = grpcObject.release_notifier as grpc.GrpcObject;
  const ClientConstructor =
    releaseNotifierPackage.ReleaseNotifier as grpc.ServiceClientConstructor;

  return new ClientConstructor(address, grpc.credentials.createInsecure());
};

const authMetadata = (apiKey: string): grpc.Metadata => {
  const metadata = new grpc.Metadata();
  metadata.set('x-api-key', apiKey);
  return metadata;
};

describe('gRPC integration', () => {
  let ctx: TestComposition;
  let grpcServer: grpc.Server | null = null;
  let grpcClient: grpc.Client | null = null;

  beforeAll(async () => {
    ctx = buildTestApp({ apiKey: 'grpc-test-key' });
    const { server, address } = await buildTestGrpcServer(ctx, TEST_GRPC_PORT);
    grpcServer = server;
    grpcClient = buildClient(address);
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
    const { error } = await callUnary<{ subscriptions: unknown[] }>(
      grpcClient!,
      'GetSubscriptions',
      { email: 'user@example.com' },
    );

    expect(error).toBeDefined();
    expect(error?.code).toBe(grpc.status.UNAUTHENTICATED);
  });

  it('rejects unauthenticated Subscribe call', async () => {
    const { error } = await callUnary<{ message: string }>(
      grpcClient!,
      'Subscribe',
      { email: 'user@example.com', repo: 'owner/repo' },
    );

    expect(error).toBeDefined();
    expect(error?.code).toBe(grpc.status.UNAUTHENTICATED);
  });

  it('Subscribe creates subscription and confirms via Confirm', async () => {
    const { error, response } = await callUnary<{ message: string }>(
      grpcClient!,
      'Subscribe',
      { email: 'grpc@example.com', repo: 'owner/repo' },
      authMetadata(ctx.apiKey),
    );

    expect(error).toBeNull();
    expect(response?.message).toBe(
      'Subscription successful. Confirmation email sent.',
    );
    expect(ctx.subscriptions.all()).toHaveLength(1);

    const [sub] = ctx.subscriptions.all();
    const { error: confirmError, response: confirmResponse } = await callUnary<{
      message: string;
    }>(
      grpcClient!,
      'Confirm',
      { token: sub!.confirmationToken },
      authMetadata(ctx.apiKey),
    );

    expect(confirmError).toBeNull();
    expect(confirmResponse?.message).toBe('Subscription confirmed successfully');
    expect(ctx.subscriptions.all()[0]!.confirmed).toBe(true);
  });

  it('GetSubscriptions returns mapped subscriptions for an email', async () => {
    // ensure repo has a tag so the DTO includes last_seen_tag
    const repo = [...ctx.repositories.byName.values()].find(
      (r) => r.fullName === 'owner/repo',
    );
    expect(repo).toBeDefined();
    await ctx.repositories.updateLastSeenTag(repo!.id, 'v2.0.0');

    const { error, response } = await callUnary<{
      subscriptions: Array<{
        email: string;
        repo: string;
        confirmed: boolean;
        last_seen_tag?: string;
      }>;
    }>(
      grpcClient!,
      'GetSubscriptions',
      { email: 'grpc@example.com' },
      authMetadata(ctx.apiKey),
    );

    expect(error).toBeNull();
    expect(response?.subscriptions).toHaveLength(1);
    expect(response?.subscriptions[0]).toMatchObject({
      email: 'grpc@example.com',
      repo: 'owner/repo',
      confirmed: true,
      last_seen_tag: 'v2.0.0',
    });
  });

  it('Unsubscribe removes the subscription', async () => {
    const [sub] = ctx.subscriptions.all();
    expect(sub).toBeDefined();

    const { error, response } = await callUnary<{ message: string }>(
      grpcClient!,
      'Unsubscribe',
      { token: sub!.unsubscribeToken },
      authMetadata(ctx.apiKey),
    );

    expect(error).toBeNull();
    expect(response?.message).toBe('Unsubscribed successfully');
    expect(ctx.subscriptions.all()).toHaveLength(0);
  });

  it('Subscribe maps validation errors to INVALID_ARGUMENT', async () => {
    const { error } = await callUnary<{ message: string }>(
      grpcClient!,
      'Subscribe',
      { email: 'not-an-email', repo: 'owner/repo' },
      authMetadata(ctx.apiKey),
    );

    expect(error).toBeDefined();
    expect(error?.code).toBe(grpc.status.INVALID_ARGUMENT);
  });

  it('Subscribe maps domain NotFoundError when repo does not exist', async () => {
    ctx.github.state.exists = false;
    try {
      const { error } = await callUnary<{ message: string }>(
        grpcClient!,
        'Subscribe',
        { email: 'someone@example.com', repo: 'unknown/repo' },
        authMetadata(ctx.apiKey),
      );

      expect(error).toBeDefined();
      expect(error?.code).toBe(grpc.status.NOT_FOUND);
    } finally {
      ctx.github.state.exists = true;
    }
  });
});
