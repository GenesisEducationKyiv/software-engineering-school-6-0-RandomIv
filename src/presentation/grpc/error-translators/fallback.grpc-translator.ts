import { status, type ServiceError } from '@grpc/grpc-js';
import {
  GrpcExceptionTranslator,
  buildGrpcError,
} from './grpc-exception-translator.port';

export class FallbackGrpcExceptionTranslator
  implements GrpcExceptionTranslator
{
  canHandle(_: unknown): boolean {
    return true;
  }

  translate(error: unknown): ServiceError {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return buildGrpcError(status.INTERNAL, message);
  }
}
