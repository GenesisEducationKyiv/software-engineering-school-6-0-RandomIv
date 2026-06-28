import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { AppError } from '../errors';
import { HttpStatus } from '../constants/http-status.constant';
import { config } from '../../config';
import { logger } from '../../core/logger';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const getStatusCode = (error: unknown): number => {
  if (isRecord(error) && typeof error.status === 'number') {
    return error.status;
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
};

const getZodIssuePath = (issue: ZodIssue): string => {
  if (issue.path.length === 0) {
    return 'body';
  }

  return issue.path.map(String).join('.');
};

const formatZodIssues = (error: ZodError) => {
  return error.issues.map((issue) => ({
    field: getZodIssuePath(issue),
    message: issue.message,
    code: issue.code,
  }));
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response | void => {
  logger.error({ err }, 'HTTP request handler error');

  if (err instanceof ZodError) {
    return res.status(HttpStatus.BAD_REQUEST).json({
      status: 'error',
      message: 'Validation failed',
      errors: formatZodIssues(err),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  const statusCode = getStatusCode(err);
  const stack = err instanceof Error ? err.stack : undefined;

  return res.status(statusCode).json({
    status: 'error',
    message: 'Internal Server Error',
    ...(config.NODE_ENV === 'development' && stack ? { stack } : {}),
  });
};
