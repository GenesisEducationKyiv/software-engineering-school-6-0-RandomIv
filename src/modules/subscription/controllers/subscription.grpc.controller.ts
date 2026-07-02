import type * as grpc from '@grpc/grpc-js';
import { MESSAGES } from '../../../common/constants/messages.constant';
import { validateApiKey } from '../../../common/utils/api-key.util';
import type { SubscriptionService } from '../subscription.service';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../subscription.schema';
import { toSubscriptionDto } from './subscription.mapper';
import { toGrpcServiceError } from '../../../core/grpc/grpc.error-mapper';
import type {
  ConfirmRequest,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  OperationResponse,
  ReleaseNotifierHandlers,
  SubscribeRequest,
  UnsubscribeRequest,
} from '../../../core/grpc/grpc.types';
import { status } from '@grpc/grpc-js';
import { logger } from '../../../core/logger';
import { getGrpcMetrics } from '../../../core/metrics/prometheus';

const API_KEY_METADATA_KEY = 'x-api-key';

const getCallPath = (call: grpc.ServerUnaryCall<unknown, unknown>): string => {
  return call.getPath();
};

const withUnaryHandler = <TRequest, TResponse>(
  handler: (
    call: grpc.ServerUnaryCall<TRequest, TResponse>,
  ) => Promise<TResponse>,
): grpc.handleUnaryCall<TRequest, TResponse> => {
  const { requestCounter, requestDurationHistogram } = getGrpcMetrics();
  return (call, callback) => {
    const stopTimer = requestDurationHistogram.startTimer();
    const method = getCallPath(call);

    const parts = method.split('/');
    const service = parts[1] ?? 'unknown';

    handler(call)
      .then((result) => {
        const labels = {
          method,
          service,
          status_code: String(status.OK),
        };
        requestCounter.inc(labels);
        stopTimer(labels);

        callback(null, result);
      })
      .catch((error: unknown) => {
        const grpcError = toGrpcServiceError(error);
        const statusCode = grpcError.code ?? status.INTERNAL;
        const labels = {
          method,
          service,
          status_code: String(statusCode),
        };
        requestCounter.inc(labels);
        stopTimer(labels);

        const safeRequest: Record<string, string> = {};
        if (call.request && typeof call.request === 'object') {
          for (const [k, v] of Object.entries(
            call.request as Record<string, unknown>,
          )) {
            if (typeof v === 'string') safeRequest[k] = v;
          }
        }

        logger.error(
          {
            err: {
              message: grpcError.message,
              stack: grpcError.stack,
              name: grpcError.name,
            },
            grpcCode: statusCode,
            grpcDetails: grpcError.details,
            path: method,
            request: safeRequest,
          },
          'gRPC handler failure',
        );

        callback(grpcError);
      });
  };
};

const getApiKeyFromMetadata = (metadata: grpc.Metadata): string | undefined => {
  const raw = metadata.get(API_KEY_METADATA_KEY)[0];
  return typeof raw === 'string' ? raw : undefined;
};

export class SubscriptionGrpcController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly apiKey: string,
  ) {}

  private ensureAuthorized(metadata: grpc.Metadata): void {
    const providedApiKey = getApiKeyFromMetadata(metadata);
    validateApiKey(providedApiKey, this.apiKey);
  }

  public subscribe = withUnaryHandler<SubscribeRequest, OperationResponse>(
    async (call) => {
      this.ensureAuthorized(call.metadata);
      const { email, repo } = subscribeSchema.parse(call.request);
      await this.subscriptionService.subscribe({ email, repo });

      return {
        message: MESSAGES.SUBSCRIBE_SUCCESS,
      };
    },
  );

  public confirm = withUnaryHandler<ConfirmRequest, OperationResponse>(
    async (call) => {
      this.ensureAuthorized(call.metadata);
      const { token } = tokenParamSchema.parse({ token: call.request.token });
      await this.subscriptionService.confirmSubscription({ token });

      return {
        message: MESSAGES.CONFIRM_SUCCESS,
      };
    },
  );

  public unsubscribe = withUnaryHandler<UnsubscribeRequest, OperationResponse>(
    async (call) => {
      this.ensureAuthorized(call.metadata);
      const { token } = tokenParamSchema.parse({ token: call.request.token });
      await this.subscriptionService.unsubscribeByToken({ token });

      return {
        message: MESSAGES.UNSUBSCRIBE_SUCCESS,
      };
    },
  );

  public getSubscriptions = withUnaryHandler<
    GetSubscriptionsRequest,
    GetSubscriptionsResponse
  >(async (call) => {
    this.ensureAuthorized(call.metadata);

    const { email } = subscriptionsQuerySchema.parse({
      email: call.request.email,
    });
    const subscriptions =
      await this.subscriptionService.getSubscriptionsByEmail({ email });

    return {
      subscriptions: subscriptions.map(toSubscriptionDto),
    };
  });
}

export const createSubscriptionGrpcHandlers = (
  controller: SubscriptionGrpcController,
): ReleaseNotifierHandlers => ({
  subscribe: controller.subscribe,
  confirm: controller.confirm,
  unsubscribe: controller.unsubscribe,
  getSubscriptions: controller.getSubscriptions,
});
