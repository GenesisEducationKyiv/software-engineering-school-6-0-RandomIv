import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../../src/common/errors';
import {
  API_KEY_HEADER,
  requireApiKey,
} from '../../../src/common/middlewares/api-key.middleware';

describe('api-key.middleware', () => {
  const res = {} as Response;

  it('calls next with UnauthorizedError when API key is missing', () => {
    const req = {
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    requireApiKey(req, res, next);

    expect(req.header).toHaveBeenCalledWith(API_KEY_HEADER);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid API key' }),
    );
  });

  it('calls next with UnauthorizedError when API key is invalid', () => {
    const req = {
      header: jest.fn().mockReturnValue('wrong-api-key'),
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('calls next without error when API key is valid', () => {
    const req = {
      header: jest.fn().mockReturnValue('test-api-key'),
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
