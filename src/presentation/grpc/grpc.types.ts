import type * as grpc from '@grpc/grpc-js';

export interface SubscribeRequest {
  email: string;
  repo: string;
}

export interface ConfirmRequest {
  token: string;
}

export interface UnsubscribeRequest {
  token: string;
}

export interface GetSubscriptionsRequest {
  email: string;
}

export interface OperationResponse {
  message: string;
}

export interface SubscriptionItem {
  email: string;
  repo: string;
  confirmed: boolean;
  last_seen_tag?: string;
}

export interface GetSubscriptionsResponse {
  subscriptions: SubscriptionItem[];
}

export interface ReleaseNotifierHandlers
  extends grpc.UntypedServiceImplementation {
  subscribe: grpc.handleUnaryCall<SubscribeRequest, OperationResponse>;
  confirm: grpc.handleUnaryCall<ConfirmRequest, OperationResponse>;
  unsubscribe: grpc.handleUnaryCall<UnsubscribeRequest, OperationResponse>;
  getSubscriptions: grpc.handleUnaryCall<
    GetSubscriptionsRequest,
    GetSubscriptionsResponse
  >;
}

export type ReleaseNotifierServiceClientConstructor =
  grpc.ServiceClientConstructor & {
    service: grpc.ServiceDefinition<grpc.UntypedServiceImplementation>;
  };

export interface ReleaseNotifierGrpcPackage {
  ReleaseNotifier: ReleaseNotifierServiceClientConstructor;
}

export type LoadedGrpcObject = grpc.GrpcObject & {
  release_notifier?: grpc.GrpcObject & Partial<ReleaseNotifierGrpcPackage>;
};
