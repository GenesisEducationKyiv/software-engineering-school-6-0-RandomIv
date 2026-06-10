import type { NextFunction, Request, Response } from 'express';
import {
  API_KEY_HEADER,
  requireApiKey,
} from '../../../../src/common/middlewares/api-key.middleware';

describe('api-key.middleware', () => {
  const res = {} as Response;

  it('throws UnauthorizedError when API key is missing', () => {
    const req = {
      header: jest.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    expect(() => requireApiKey(req, res, next)).toThrow('Invalid API key');

    expect(req.header).toHaveBeenCalledWith(API_KEY_HEADER);
    expect(next).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedError when API key is invalid', () => {
    const req = {
      header: jest.fn().mockReturnValue('wrong-api-key'),
    } as unknown as Request;
    const next = jest.fn() as NextFunction;

    expect(() => requireApiKey(req, res, next)).toThrow('Invalid API key');

    expect(next).not.toHaveBeenCalled();
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
