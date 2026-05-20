import type * as grpc from '@grpc/grpc-js';
import { UnauthorizedError } from '../../domain/errors';
import { SubscribeUseCase } from '../../application/subscription/subscribe.use-case';
import { ConfirmSubscriptionUseCase } from '../../application/subscription/confirm-subscription.use-case';
import { UnsubscribeUseCase } from '../../application/subscription/unsubscribe.use-case';
import { ListSubscriptionsUseCase } from '../../application/subscription/list-subscriptions.use-case';
import { GrpcExceptionTranslatorRegistry } from './error-translators/grpc-exception-translator.registry';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../http/dto/subscription.schema';
import { toSubscriptionDto } from '../http/dto/subscription.mapper';
import type {
  ConfirmRequest,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  OperationResponse,
  ReleaseNotifierHandlers,
  SubscribeRequest,
  UnsubscribeRequest,
} from './grpc.types';

const API_KEY_METADATA_KEY = 'x-api-key';

const ensureAuthorized = (metadata: grpc.Metadata, expected: string): void => {
  const raw = metadata.get(API_KEY_METADATA_KEY)[0];
  const provided = typeof raw === 'string' ? raw : undefined;
  if (!provided || provided !== expected) {
    throw new UnauthorizedError('Invalid API key');
  }
};

export interface BuildHandlersDeps {
  subscribe: SubscribeUseCase;
  confirm: ConfirmSubscriptionUseCase;
  unsubscribe: UnsubscribeUseCase;
  list: ListSubscriptionsUseCase;
  errors: GrpcExceptionTranslatorRegistry;
  apiKey: string;
}

export const buildReleaseNotifierHandlers = (
  deps: BuildHandlersDeps,
): ReleaseNotifierHandlers => {
  const wrap =
    <TReq, TRes>(
      work: (req: TReq, metadata: grpc.Metadata) => Promise<TRes>,
    ): grpc.handleUnaryCall<TReq, TRes> =>
    (call, callback) => {
      work(call.request, call.metadata)
        .then((result) => callback(null, result))
        .catch((error: unknown) => callback(deps.errors.translate(error)));
    };

  return {
    subscribe: wrap<SubscribeRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const input = subscribeSchema.parse(req);
      await deps.subscribe.execute(input);
      return { message: 'Subscription successful. Confirmation email sent.' };
    }),
    confirm: wrap<ConfirmRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const { token } = tokenParamSchema.parse({ token: req.token });
      await deps.confirm.execute({ token });
      return { message: 'Subscription confirmed successfully' };
    }),
    unsubscribe: wrap<UnsubscribeRequest, OperationResponse>(
      async (req, md) => {
        ensureAuthorized(md, deps.apiKey);
        const { token } = tokenParamSchema.parse({ token: req.token });
        await deps.unsubscribe.execute({ token });
        return { message: 'Unsubscribed successfully' };
      },
    ),
    getSubscriptions: wrap<GetSubscriptionsRequest, GetSubscriptionsResponse>(
      async (req, md) => {
        ensureAuthorized(md, deps.apiKey);
        const { email } = subscriptionsQuerySchema.parse({ email: req.email });
        const subs = await deps.list.execute({ email });
        return { subscriptions: subs.map(toSubscriptionDto) };
      },
    ),
  };
};
