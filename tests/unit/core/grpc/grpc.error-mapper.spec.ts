import { status } from '@grpc/grpc-js';
import { z } from 'zod';
import {
  AppError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from '../../../../src/common/errors';
import { toGrpcServiceError } from '../../../../src/core/grpc/grpc.error-mapper';

describe('grpc.error-mapper', () => {
  it('maps AppError(400) to INVALID_ARGUMENT', () => {
    const error = toGrpcServiceError(new AppError(400, 'Bad request'));
    expect(error.code).toBe(status.INVALID_ARGUMENT);
    expect(error.message).toBe('Bad request');
  });

  it('maps UnauthorizedError to UNAUTHENTICATED', () => {
    const error = toGrpcServiceError(new UnauthorizedError('Invalid API key'));
    expect(error.code).toBe(status.UNAUTHENTICATED);
  });

  it('maps NotFoundError to NOT_FOUND', () => {
    const error = toGrpcServiceError(new NotFoundError('Missing'));
    expect(error.code).toBe(status.NOT_FOUND);
  });

  it('maps ConflictError to ALREADY_EXISTS', () => {
    const error = toGrpcServiceError(new ConflictError('Duplicate'));
    expect(error.code).toBe(status.ALREADY_EXISTS);
  });

  it('maps RateLimitError to RESOURCE_EXHAUSTED', () => {
    const error = toGrpcServiceError(new RateLimitError());
    expect(error.code).toBe(status.RESOURCE_EXHAUSTED);
  });

  it('maps ZodError to INVALID_ARGUMENT', () => {
    const parsed = z.object({ email: z.email() }).safeParse({ email: 'wrong' });
    if (parsed.success) {
      throw new Error('Expected parse to fail');
    }

    const error = toGrpcServiceError(parsed.error);
    expect(error.code).toBe(status.INVALID_ARGUMENT);
    expect(error.message).toContain('Validation failed');
  });

  it('maps unknown errors to INTERNAL', () => {
    const error = toGrpcServiceError(new Error('Unexpected'));
    expect(error.code).toBe(status.INTERNAL);
    expect(error.message).toBe('Unexpected');
  });
});
