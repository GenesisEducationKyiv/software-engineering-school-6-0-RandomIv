import type * as grpc from '@grpc/grpc-js';
import { UnauthorizedError } from '../../common/errors';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../subscription/subscription.schema';
import { toSubscriptionDto } from '../subscription/subscription.mapper';
import { toGrpcServiceError } from './grpc.error-mapper';
import type {
  ConfirmRequest,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  OperationResponse,
  ReleaseNotifierHandlers,
  SubscribeRequest,
  UnsubscribeRequest,
} from './grpc.types';

const SUBSCRIBE_SUCCESS_MESSAGE = 'Subscription successful. Confirmation email sent.';
const CONFIRM_SUCCESS_MESSAGE = 'Subscription confirmed successfully';
const UNSUBSCRIBE_SUCCESS_MESSAGE = 'Unsubscribed successfully';
const API_KEY_METADATA_KEY = 'x-api-key';

const withUnaryHandler = <TRequest, TResponse>(
  handler: (
    call: grpc.ServerUnaryCall<TRequest, TResponse>,
  ) => Promise<TResponse>,
): grpc.handleUnaryCall<TRequest, TResponse> => {
  return (call, callback) => {
    handler(call)
      .then((result) => {
        callback(null, result);
      })
      .catch((error: unknown) => {
        callback(toGrpcServiceError(error));
      });
  };
};

const getApiKeyFromMetadata = (metadata: grpc.Metadata): string | undefined => {
  const raw = metadata.get(API_KEY_METADATA_KEY)[0];
  return typeof raw === 'string' ? raw : undefined;
};

export class ReleaseNotifierGrpcHandlerFactory {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly apiKey: string,
  ) {}

  createHandlers(): ReleaseNotifierHandlers {
    const ensureAuthorized = (metadata: grpc.Metadata): void => {
      const providedApiKey = getApiKeyFromMetadata(metadata);
      if (!providedApiKey || providedApiKey !== this.apiKey) {
        throw new UnauthorizedError('Invalid API key');
      }
    };

    const subscribe = withUnaryHandler<SubscribeRequest, OperationResponse>(
      async (call) => {
        ensureAuthorized(call.metadata);
        const { email, repo } = subscribeSchema.parse(call.request);
        await this.subscriptionService.createSubscription({ email, repo });

        return {
          message: SUBSCRIBE_SUCCESS_MESSAGE,
        };
      },
    );

    const confirm = withUnaryHandler<ConfirmRequest, OperationResponse>(
      async (call) => {
        ensureAuthorized(call.metadata);
        const { token } = tokenParamSchema.parse({ token: call.request.token });
        await this.subscriptionService.confirmSubscription({ token });

        return {
          message: CONFIRM_SUCCESS_MESSAGE,
        };
      },
    );

    const unsubscribe = withUnaryHandler<UnsubscribeRequest, OperationResponse>(
      async (call) => {
        ensureAuthorized(call.metadata);
        const { token } = tokenParamSchema.parse({ token: call.request.token });
        await this.subscriptionService.unsubscribeByToken({ token });

        return {
          message: UNSUBSCRIBE_SUCCESS_MESSAGE,
        };
      },
    );

    const getSubscriptions = withUnaryHandler<
      GetSubscriptionsRequest,
      GetSubscriptionsResponse
    >(async (call) => {
      ensureAuthorized(call.metadata);

      const { email } = subscriptionsQuerySchema.parse({
        email: call.request.email,
      });
      const subscriptions =
        await this.subscriptionService.getSubscriptionsByEmail({ email });

      return {
        subscriptions: subscriptions.map(toSubscriptionDto),
      };
    });

    return {
      subscribe,
      confirm,
      unsubscribe,
      getSubscriptions,
    };
  }
}

export const createReleaseNotifierGrpcHandlers = (
  subscriptionService: SubscriptionService,
  apiKey: string,
): ReleaseNotifierHandlers => {
  return new ReleaseNotifierGrpcHandlerFactory(
    subscriptionService,
    apiKey,
  ).createHandlers();
};