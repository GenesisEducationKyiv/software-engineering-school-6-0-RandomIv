import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { validateApiKey } from '../utils/api-key.util';

export const API_KEY_HEADER = 'x-api-key';

export const requireApiKey = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const providedApiKey = req.header(API_KEY_HEADER);
  validateApiKey(providedApiKey, config.API_KEY);
  next();
};
