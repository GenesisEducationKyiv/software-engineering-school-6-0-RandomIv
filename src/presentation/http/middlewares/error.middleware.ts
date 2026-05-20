import type { NextFunction, Request, Response } from 'express';
import { LoggerPort } from '../../../application/ports/logger.port';
import { ExceptionTranslatorRegistry } from '../error-translators/exception-translator.registry';

export const buildErrorMiddleware =
  (registry: ExceptionTranslatorRegistry, logger: LoggerPort) =>
  (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`[Error] ${name}: ${message}`);

    const { status, body } = registry.translate(err);
    res.status(status).json(body);
  };
