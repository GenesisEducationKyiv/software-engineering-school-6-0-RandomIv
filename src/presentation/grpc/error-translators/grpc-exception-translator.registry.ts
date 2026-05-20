import type { ServiceError } from '@grpc/grpc-js';
import { GrpcExceptionTranslator } from './grpc-exception-translator.port';

export class GrpcExceptionTranslatorRegistry {
  constructor(private readonly translators: GrpcExceptionTranslator[]) {}

  translate(error: unknown): ServiceError {
    const found = this.translators.find((t) => t.canHandle(error));
    if (!found) {
      throw new Error(
        'No gRPC translator could handle the error - add a fallback translator',
      );
    }
    return found.translate(error);
  }
}
