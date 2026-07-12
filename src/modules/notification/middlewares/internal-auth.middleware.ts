import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { validateApiKey } from '../../../common/utils/api-key.util';

export const INTERNAL_KEY_HEADER = 'x-internal-key';

export const createInternalAuth = (expectedKey: string): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    validateApiKey(req.header(INTERNAL_KEY_HEADER), expectedKey);
    next();
  };
};
