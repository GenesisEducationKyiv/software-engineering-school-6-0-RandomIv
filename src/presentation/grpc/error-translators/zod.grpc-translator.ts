import { ZodError } from 'zod';
import { status, type ServiceError } from '@grpc/grpc-js';
import {
  GrpcExceptionTranslator,
  buildGrpcError,
} from './grpc-exception-translator.port';

export class ZodGrpcExceptionTranslator implements GrpcExceptionTranslator {
  canHandle(error: unknown): error is ZodError {
    return error instanceof ZodError;
  }

  translate(error: ZodError): ServiceError {
    const details =
      error.issues.length === 0
        ? 'Validation failed'
        : `Validation failed: ${error.issues
            .map(
              (i) =>
                `${i.path.length ? i.path.join('.') : 'body'}: ${i.message}`,
            )
            .join('; ')}`;
    return buildGrpcError(status.INVALID_ARGUMENT, details);
  }
}
