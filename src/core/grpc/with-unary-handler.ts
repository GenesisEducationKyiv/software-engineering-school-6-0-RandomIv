import type * as grpc from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { toGrpcServiceError } from './grpc.error-mapper';
import { logger } from '../logger';
import { getGrpcMetrics } from '../metrics/prometheus';

const getCallPath = (call: grpc.ServerUnaryCall<unknown, unknown>): string => {
  return call.getPath();
};

export const withUnaryHandler = <TRequest, TResponse>(
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
