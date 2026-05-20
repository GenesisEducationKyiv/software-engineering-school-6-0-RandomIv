import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../../../domain/errors';

export const API_KEY_HEADER = 'x-api-key';

export const buildApiKeyMiddleware = (expectedKey: string): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const providedApiKey = req.header(API_KEY_HEADER);

    if (!providedApiKey || providedApiKey !== expectedKey) {
      next(new UnauthorizedError('Invalid API key'));
      return;
    }

    next();
  };
};
