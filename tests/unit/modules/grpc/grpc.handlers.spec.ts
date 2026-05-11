import * as grpc from '@grpc/grpc-js';
import { ConflictError } from '../../../../src/common/errors';
import { createReleaseNotifierGrpcHandlers } from '../../../../src/modules/grpc/grpc.handlers';
import type {
  ConfirmRequest,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  OperationResponse,
  SubscribeRequest,
  UnsubscribeRequest,
} from '../../../../src/modules/grpc/grpc.types';
import type { SubscriptionService } from '../../../../src/modules/subscription/subscription.service';

const TEST_API_KEY = 'test-api-key';

const invokeUnary = <TReq, TRes>(
  handler: grpc.handleUnaryCall<TReq, TRes>,
  request: TReq,
  metadata = new grpc.Metadata(),
): Promise<{
  error: grpc.ServiceError | null;
  response: TRes | null | undefined;
}> => {
  return new Promise((resolve) => {
    const call = { request, metadata } as grpc.ServerUnaryCall<TReq, TRes>;
    handler(call, (error, response) => {
      resolve({ error: error as grpc.ServiceError | null, response });
    });
  });
};

describe('grpc.handlers', () => {
  const subscriptionService: SubscriptionService = {
    createSubscription: jest.fn(),
    confirmSubscription: jest.fn(),
    unsubscribeByToken: jest.fn(),
    getSubscriptionsByEmail: jest.fn(),
  };

  const handlers = createReleaseNotifierGrpcHandlers(
    subscriptionService,
    TEST_API_KEY,
  );

  const withApiKey = (): grpc.Metadata => {
    const metadata = new grpc.Metadata();
    metadata.set('x-api-key', TEST_API_KEY);
    return metadata;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('subscribe requires API key metadata', async () => {
    const result = await invokeUnary<SubscribeRequest, OperationResponse>(
      handlers.subscribe,
      {
        email: 'user@example.com',
        repo: 'owner/repo',
      },
    );

    expect(result.error?.code).toBe(grpc.status.UNAUTHENTICATED);
    expect(subscriptionService.createSubscription).not.toHaveBeenCalled();
  });

  it('subscribe returns success message', async () => {
    (
      subscriptionService.createSubscription as jest.MockedFunction<
        SubscriptionService['createSubscription']
      >
    ).mockResolvedValue({} as never);

    const result = await invokeUnary<SubscribeRequest, OperationResponse>(
      handlers.subscribe,
      {
        email: 'user@example.com',
        repo: ' owner/repo ',
      },
      withApiKey(),
    );

    expect(result.error).toBeNull();
    expect(result.response).toEqual({
      message: 'Subscription successful. Confirmation email sent.',
    });
    expect(subscriptionService.createSubscription).toHaveBeenCalledWith({
      email: 'user@example.com',
      repo: 'owner/repo',
    });
  });

  it('subscribe maps service conflict to ALREADY_EXISTS', async () => {
    (
      subscriptionService.createSubscription as jest.MockedFunction<
        SubscriptionService['createSubscription']
      >
    ).mockRejectedValueOnce(
      new ConflictError('Email already subscribed to this repository'),
    );

    const result = await invokeUnary<SubscribeRequest, OperationResponse>(
      handlers.subscribe,
      {
        email: 'user@example.com',
        repo: 'owner/repo',
      },
      withApiKey(),
    );

    expect(result.error?.code).toBe(grpc.status.ALREADY_EXISTS);
  });

  it('confirm validates token as UUID', async () => {
    const result = await invokeUnary<ConfirmRequest, OperationResponse>(
      handlers.confirm,
      {
        token: 'not-a-uuid',
      },
      withApiKey(),
    );

    expect(result.error?.code).toBe(grpc.status.INVALID_ARGUMENT);
    expect(subscriptionService.confirmSubscription).not.toHaveBeenCalled();
  });

  it('unsubscribe returns success message', async () => {
    (
      subscriptionService.unsubscribeByToken as jest.MockedFunction<
        SubscriptionService['unsubscribeByToken']
      >
    ).mockResolvedValueOnce();

    const result = await invokeUnary<UnsubscribeRequest, OperationResponse>(
      handlers.unsubscribe,
      {
        token: '8c917f35-99a6-44d3-b200-e36dcf346f2e',
      },
      withApiKey(),
    );

    expect(result.error).toBeNull();
    expect(result.response).toEqual({
      message: 'Unsubscribed successfully',
    });
  });

  it('getSubscriptions requires API key metadata', async () => {
    const result = await invokeUnary<
      GetSubscriptionsRequest,
      GetSubscriptionsResponse
    >(handlers.getSubscriptions, {
      email: 'user@example.com',
    });

    expect(result.error?.code).toBe(grpc.status.UNAUTHENTICATED);
    expect(subscriptionService.getSubscriptionsByEmail).not.toHaveBeenCalled();
  });

  it('getSubscriptions returns mapped subscriptions for authorized request', async () => {
    (
      subscriptionService.getSubscriptionsByEmail as jest.MockedFunction<
        SubscriptionService['getSubscriptionsByEmail']
      >
    ).mockResolvedValueOnce([
      {
        id: 'sub-1',
        email: 'user@example.com',
        confirmed: true,
        confirmationToken: 'e6e5eb8d-7636-434d-bf5f-a2b41752d65c',
        unsubscribeToken: 'e5f7781a-1d8f-4939-b5c2-9877332e9621',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        repositoryId: 'repo-1',
        repository: {
          id: 'repo-1',
          fullName: 'owner/repo',
          lastSeenTag: 'v1.2.3',
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      },
    ] as never);

    const result = await invokeUnary<
      GetSubscriptionsRequest,
      GetSubscriptionsResponse
    >(
      handlers.getSubscriptions,
      {
        email: 'user@example.com',
      },
      withApiKey(),
    );

    expect(result.error).toBeNull();
    expect(result.response).toEqual({
      subscriptions: [
        {
          email: 'user@example.com',
          repo: 'owner/repo',
          confirmed: true,
          last_seen_tag: 'v1.2.3',
        },
      ],
    });
  });
});
