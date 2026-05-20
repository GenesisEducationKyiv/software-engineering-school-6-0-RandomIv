import { status, type ServiceError } from '@grpc/grpc-js';
import { AppError } from '../../../domain/errors';
import { HttpStatus } from '../../../common/constants/http-status.constants';
import {
  GrpcExceptionTranslator,
  buildGrpcError,
} from './grpc-exception-translator.port';

const grpcByHttp: Partial<Record<number, status>> = {
  [HttpStatus.BAD_REQUEST]: status.INVALID_ARGUMENT,
  [HttpStatus.UNAUTHORIZED]: status.UNAUTHENTICATED,
  [HttpStatus.NOT_FOUND]: status.NOT_FOUND,
  [HttpStatus.CONFLICT]: status.ALREADY_EXISTS,
  [HttpStatus.TOO_MANY_REQUESTS]: status.RESOURCE_EXHAUSTED,
  [HttpStatus.INTERNAL_SERVER_ERROR]: status.INTERNAL,
};

export class AppErrorGrpcTranslator implements GrpcExceptionTranslator {
  canHandle(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  translate(error: AppError): ServiceError {
    return buildGrpcError(
      grpcByHttp[error.statusCode] ?? status.INTERNAL,
      error.message,
    );
  }
}
