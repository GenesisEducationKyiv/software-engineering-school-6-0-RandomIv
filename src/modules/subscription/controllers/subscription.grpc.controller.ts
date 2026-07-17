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
import type {
  ConfirmRequest,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  OperationResponse,
  ReleaseNotifierHandlers,
  SubscribeRequest,
  UnsubscribeRequest,
} from '../../../core/grpc/grpc.types';
import { withUnaryHandler } from '../../../core/grpc/with-unary-handler';

const API_KEY_METADATA_KEY = 'x-api-key';

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
