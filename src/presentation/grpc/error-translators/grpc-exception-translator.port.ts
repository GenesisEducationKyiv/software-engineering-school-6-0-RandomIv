import type { ServiceError, status } from '@grpc/grpc-js';

export interface GrpcExceptionTranslator {
  canHandle(error: unknown): boolean;
  translate(error: unknown): ServiceError;
}

export const buildGrpcError = (
  code: status,
  message: string,
): ServiceError =>
  Object.assign(new Error(message), { code, details: message }) as ServiceError;
