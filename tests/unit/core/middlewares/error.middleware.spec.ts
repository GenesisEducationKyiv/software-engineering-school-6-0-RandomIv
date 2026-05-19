import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../../../src/common/errors';
import { HttpStatus } from '../../../../src/common/constants/http-status.constants';
import { errorHandler } from '../../../../src/common/middlewares/error.middleware';

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

  it('uses numeric status from unknown record-like error', () => {
    const res = createResponse();
    const err = { status: 401 };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
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
