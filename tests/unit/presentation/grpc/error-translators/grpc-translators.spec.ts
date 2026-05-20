import { status } from '@grpc/grpc-js';
import { z } from 'zod';
import {
  AppError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  BadRequestError,
} from '../../../../../src/domain/errors';
import { GrpcExceptionTranslatorRegistry } from '../../../../../src/presentation/grpc/error-translators/grpc-exception-translator.registry';
import { ZodGrpcExceptionTranslator } from '../../../../../src/presentation/grpc/error-translators/zod.grpc-translator';
import { AppErrorGrpcTranslator } from '../../../../../src/presentation/grpc/error-translators/app-error.grpc-translator';
import { FallbackGrpcExceptionTranslator } from '../../../../../src/presentation/grpc/error-translators/fallback.grpc-translator';

const buildRegistry = (): GrpcExceptionTranslatorRegistry =>
  new GrpcExceptionTranslatorRegistry([
    new ZodGrpcExceptionTranslator(),
    new AppErrorGrpcTranslator(),
    new FallbackGrpcExceptionTranslator(),
  ]);

describe('gRPC error translators', () => {
  it('maps AppError(400) / BadRequestError to INVALID_ARGUMENT', () => {
    const r = buildRegistry();
    expect(r.translate(new AppError(400, 'Bad request')).code).toBe(
      status.INVALID_ARGUMENT,
    );
    expect(r.translate(new BadRequestError('Bad request')).code).toBe(
      status.INVALID_ARGUMENT,
    );
  });

  it('maps UnauthorizedError to UNAUTHENTICATED', () => {
    expect(
      buildRegistry().translate(new UnauthorizedError('Invalid API key')).code,
    ).toBe(status.UNAUTHENTICATED);
  });

  it('maps NotFoundError to NOT_FOUND', () => {
    expect(buildRegistry().translate(new NotFoundError('Missing')).code).toBe(
      status.NOT_FOUND,
    );
  });

  it('maps ConflictError to ALREADY_EXISTS', () => {
    expect(buildRegistry().translate(new ConflictError('Duplicate')).code).toBe(
      status.ALREADY_EXISTS,
    );
  });

  it('maps RateLimitError to RESOURCE_EXHAUSTED', () => {
    expect(buildRegistry().translate(new RateLimitError()).code).toBe(
      status.RESOURCE_EXHAUSTED,
    );
  });

  it('maps ZodError to INVALID_ARGUMENT', () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: 'wrong' });
    if (parsed.success) throw new Error('Expected parse to fail');

    const err = buildRegistry().translate(parsed.error);
    expect(err.code).toBe(status.INVALID_ARGUMENT);
    expect(err.message).toContain('Validation failed');
  });

  it('maps unknown errors to INTERNAL via fallback', () => {
    const err = buildRegistry().translate(new Error('Unexpected'));
    expect(err.code).toBe(status.INTERNAL);
    expect(err.message).toBe('Unexpected');
  });

  it('falls back to INTERNAL for unknown AppError status codes', () => {
    const err = buildRegistry().translate(new AppError(418, 'I am a teapot'));
    expect(err.code).toBe(status.INTERNAL);
  });
});
