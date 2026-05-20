import { z } from 'zod';
import { Prisma } from '../../../../../src/generated/prisma/client';
import { AppError } from '../../../../../src/domain/errors';
import { HttpStatus } from '../../../../../src/common/constants/http-status.constants';
import { ExceptionTranslatorRegistry } from '../../../../../src/presentation/http/error-translators/exception-translator.registry';
import { ZodExceptionTranslator } from '../../../../../src/presentation/http/error-translators/zod.translator';
import { PrismaExceptionTranslator } from '../../../../../src/presentation/http/error-translators/prisma.translator';
import { AppErrorTranslator } from '../../../../../src/presentation/http/error-translators/app-error.translator';
import { FallbackExceptionTranslator } from '../../../../../src/presentation/http/error-translators/fallback.translator';

const buildRegistry = (): ExceptionTranslatorRegistry =>
  new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(false),
  ]);

describe('HTTP exception translators', () => {
  it('maps ZodError to 400 validation response', () => {
    let validationError: unknown;
    try {
      z.object({ email: z.email() }).parse({ email: 'bad-email' });
    } catch (error) {
      validationError = error;
    }

    const { status, body } = buildRegistry().translate(validationError);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(
      expect.objectContaining({
        status: 'error',
        message: 'Validation failed',
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: expect.any(String),
            code: expect.any(String),
          }),
        ]),
      }),
    );
  });

  it('maps Prisma P2002 to 409 with target fields', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique violation',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email', 'repository_id'] },
      } as never,
    );

    const { status, body } = buildRegistry().translate(prismaError);

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toEqual({
      status: 'error',
      message: 'Unique constraint failed on: email, repository_id',
      code: 'P2002',
    });
  });

  it('maps Prisma P2002 using message fallback when meta is missing', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`full_name`)',
      { code: 'P2002', clientVersion: 'test' } as never,
    );

    const { status, body } = buildRegistry().translate(prismaError);

    expect(status).toBe(HttpStatus.CONFLICT);
    expect(body).toEqual({
      status: 'error',
      message: 'Unique constraint failed on: full_name',
      code: 'P2002',
    });
  });

  it('maps Prisma P2003 to 400 with foreign key detail', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key',
      {
        code: 'P2003',
        clientVersion: 'test',
        meta: { constraint: 'subscriptions_repository_id_fkey' },
      } as never,
    );

    const { status, body } = buildRegistry().translate(prismaError);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual({
      status: 'error',
      message:
        'Foreign key constraint failed: repository does not reference an existing record',
      code: 'P2003',
    });
  });

  it('maps Prisma P2025 to 404', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: 'test' } as never,
    );

    const { status, body } = buildRegistry().translate(prismaError);

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toEqual({
      status: 'error',
      message: 'Record not found',
      code: 'P2025',
    });
  });

  it('falls back to exception message for unknown Prisma code', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unknown prisma failure',
      { code: 'P2999', clientVersion: 'test' } as never,
    );

    const { status, body } = buildRegistry().translate(prismaError);

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual({
      status: 'error',
      message: 'Unknown prisma failure',
      code: 'P2999',
    });
  });

  it('passes through AppError status and message', () => {
    const err = new AppError(418, 'I am a teapot');
    const { status, body } = buildRegistry().translate(err);

    expect(status).toBe(418);
    expect(body).toEqual({ status: 'error', message: 'I am a teapot' });
  });

  it('falls back to 500 for unknown record-like error', () => {
    const err = { status: 401 };
    const { status, body } = buildRegistry().translate(err);

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual(
      expect.objectContaining({
        status: 'error',
        message: 'Internal Server Error',
      }),
    );
  });

  it('falls back to 500 for unknown error without status', () => {
    const err = new Error('Unexpected');
    const { status, body } = buildRegistry().translate(err);

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body).toEqual(
      expect.objectContaining({
        status: 'error',
        message: 'Internal Server Error',
      }),
    );
  });
});
