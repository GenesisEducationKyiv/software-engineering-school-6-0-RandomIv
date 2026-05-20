import type * as grpc from '@grpc/grpc-js';
import { UnauthorizedError } from '../../domain/errors';
import { SubscriptionController } from '../http/controllers/subscription.controller';
import { GrpcExceptionTranslatorRegistry } from './error-translators/grpc-exception-translator.registry';
import {
  subscribeSchema,
  subscriptionsQuerySchema,
  tokenParamSchema,
} from '../../modules/subscription/subscription.schema';
import { toSubscriptionDto } from '../../modules/subscription/subscription.mapper';
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
  controller: SubscriptionController;
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

  const useCases = deps.controller.useCases;

  return {
    subscribe: wrap<SubscribeRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const input = subscribeSchema.parse(req);
      await useCases.subscribe.execute(input);
      return { message: 'Subscription successful. Confirmation email sent.' };
    }),
    confirm: wrap<ConfirmRequest, OperationResponse>(async (req, md) => {
      ensureAuthorized(md, deps.apiKey);
      const { token } = tokenParamSchema.parse({ token: req.token });
      await useCases.confirm.execute({ token });
      return { message: 'Subscription confirmed successfully' };
    }),
    unsubscribe: wrap<UnsubscribeRequest, OperationResponse>(
      async (req, md) => {
        ensureAuthorized(md, deps.apiKey);
        const { token } = tokenParamSchema.parse({ token: req.token });
        await useCases.unsubscribe.execute({ token });
        return { message: 'Unsubscribed successfully' };
      },
    ),
    getSubscriptions: wrap<GetSubscriptionsRequest, GetSubscriptionsResponse>(
      async (req, md) => {
        ensureAuthorized(md, deps.apiKey);
        const { email } = subscriptionsQuerySchema.parse({ email: req.email });
        const subs = await useCases.list.execute({ email });
        return { subscriptions: subs.map(toSubscriptionDto) };
      },
    ),
  };
};
