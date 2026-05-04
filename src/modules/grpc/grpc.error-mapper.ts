import { status, type ServiceError } from '@grpc/grpc-js';
import { ZodError } from 'zod';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from '../../common/errors';

const grpcStatusByHttpStatus: Partial<Record<number, status>> = {
  [HttpStatus.BAD_REQUEST]: status.INVALID_ARGUMENT,
  [HttpStatus.UNAUTHORIZED]: status.UNAUTHENTICATED,
  [HttpStatus.NOT_FOUND]: status.NOT_FOUND,
  [HttpStatus.CONFLICT]: status.ALREADY_EXISTS,
  [HttpStatus.TOO_MANY_REQUESTS]: status.RESOURCE_EXHAUSTED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: status.INTERNAL,
};

const buildGrpcError = (code: status, message: string): ServiceError => {
  return Object.assign(new Error(message), {
    code,
    details: message,
  }) as ServiceError;
};

const formatValidationError = (error: ZodError): string => {
  if (error.issues.length === 0) {
    return 'Validation failed';
  }

  const details = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

  return `Validation failed: ${details}`;
};

export const toGrpcServiceError = (error: unknown): ServiceError => {
  if (error instanceof ZodError) {
    return buildGrpcError(
      status.INVALID_ARGUMENT,
      formatValidationError(error),
    );
  }

  if (error instanceof AppError) {
    const code = grpcStatusByHttpStatus[error.statusCode] ?? status.INTERNAL;
    return buildGrpcError(code, error.message);
  }

  if (error instanceof Error) {
    return buildGrpcError(status.INTERNAL, error.message);
  }

  return buildGrpcError(status.INTERNAL, 'Internal server error');
};
