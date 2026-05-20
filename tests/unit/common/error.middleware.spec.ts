import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '../../../src/generated/prisma/client';
import { AppError } from '../../../src/common/errors';
import { HttpStatus } from '../../../src/common/constants/http-status.constants';
import { errorHandler as buildErrorHandler } from '../../../src/common/middlewares/error.middleware';
import { ExceptionTranslatorRegistry } from '../../../src/presentation/http/error-translators/exception-translator.registry';
import { ZodExceptionTranslator } from '../../../src/presentation/http/error-translators/zod.translator';
import { PrismaExceptionTranslator } from '../../../src/presentation/http/error-translators/prisma.translator';
import { AppErrorTranslator } from '../../../src/presentation/http/error-translators/app-error.translator';
import { FallbackExceptionTranslator } from '../../../src/presentation/http/error-translators/fallback.translator';
import type { LoggerPort } from '../../../src/application/ports/logger.port';

const silentLogger: LoggerPort = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
const errorHandler = buildErrorHandler(
  new ExceptionTranslatorRegistry([
    new ZodExceptionTranslator(),
    new PrismaExceptionTranslator(),
    new AppErrorTranslator(),
    new FallbackExceptionTranslator(false),
  ]),
  silentLogger,
);

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
};

const createResponse = (): MockResponse => {
  const res = {} as MockResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const req = {} as Request;
const next = jest.fn() as unknown as NextFunction;

describe('error.middleware', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('maps ZodError to 400 validation response', () => {
    let validationError: unknown;
    try {
      z.object({ email: z.email() }).parse({ email: 'bad-email' });
    } catch (error) {
      validationError = error;
    }

    const res = createResponse();
    errorHandler(validationError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
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
    const res = createResponse();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
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
    const res = createResponse();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(res.json).toHaveBeenCalledWith({
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
    const res = createResponse();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
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
    const res = createResponse();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(res.json).toHaveBeenCalledWith({
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
    const res = createResponse();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Unknown prisma failure',
      code: 'P2999',
    });
  });

  it('passes through AppError status and message', () => {
    const res = createResponse();
    const err = new AppError(418, 'I am a teapot');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'I am a teapot',
    });
  });

  it('falls back to 500 for unknown record-like error', () => {
    const res = createResponse();
    const err = { status: 401 };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Internal Server Error',
      }),
    );
  });

  it('falls back to 500 for unknown error without status', () => {
    const res = createResponse();
    const err = new Error('Unexpected');

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Internal Server Error',
      }),
    );
  });
});
