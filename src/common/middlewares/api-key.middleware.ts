import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors';
import { config } from '../../config';

export const API_KEY_HEADER = 'x-api-key';

export const requireApiKey = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const providedApiKey = req.header(API_KEY_HEADER);

  if (!providedApiKey || providedApiKey !== config.API_KEY) {
    next(new UnauthorizedError('Invalid API key'));
    return;
  }

  next();
};
