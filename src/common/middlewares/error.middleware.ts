import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../errors';
import { HttpStatus } from '../constants/http-status.constants';
import { config } from '../../config';
import { logger } from '../../core/logger';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const getErrorName = (error: unknown): string => {
  return error instanceof Error ? error.name : 'UnknownError';
};

const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : 'Unknown error';
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

interface PrismaKnownErrorMeta extends Record<string, unknown> {
  target?: string[];
  constraint?: string;
  field_name?: string;
}

const getConstraintName = (meta: PrismaKnownErrorMeta): string | undefined => {
  const constraint = meta.constraint;
  if (typeof constraint === 'string' && constraint.length > 0) {
    return constraint;
  }

  const fieldName = meta.field_name;
  if (typeof fieldName === 'string' && fieldName.length > 0) {
    return fieldName;
  }

  return undefined;
};

const getConstraintField = (meta: PrismaKnownErrorMeta): string | undefined => {
  const constraint = getConstraintName(meta);
  if (!constraint) return undefined;

  if (constraint.includes('_')) {
    return constraint.split('_')[1];
  }

  return constraint;
};

const getTargetFields = (meta: PrismaKnownErrorMeta): string | undefined => {
  if (!Array.isArray(meta.target) || meta.target.length === 0) {
    return undefined;
  }

  return meta.target.join(', ');
};

const getFieldsFromPrismaMessage = (message: string): string | undefined => {
  const fieldsMatch = message.match(/fields?:\s*\(([^)]+)\)/i);
  if (fieldsMatch?.[1]) {
    const cleaned = fieldsMatch[1]
      .split(',')
      .map((part) => part.replace(/[`"']/g, '').trim())
      .filter(Boolean)
      .join(', ');

    return cleaned || undefined;
  }

  const constraintMatch = message.match(/constraint\s*`([^`]+)`/i);
  if (constraintMatch?.[1]) {
    return constraintMatch[1];
  }

  return undefined;
};

const mapPrismaException = (
  exception: Prisma.PrismaClientKnownRequestError,
): { statusCode: number; message: string } => {
  const meta = (exception.meta ?? {}) as PrismaKnownErrorMeta;

  switch (exception.code) {
    case 'P2003': {
      const field = getConstraintField(meta) ?? 'unknown field';
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Foreign key constraint failed: ${field} does not reference an existing record`,
      };
    }
    case 'P2002': {
      const fields =
        getTargetFields(meta) ??
        getConstraintName(meta) ??
        getFieldsFromPrismaMessage(exception.message);

      return {
        statusCode: HttpStatus.CONFLICT,
        message: fields
          ? `Unique constraint failed on: ${fields}`
          : 'Unique constraint failed',
      };
    }
    case 'P2025': {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Record not found',
      };
    }
    case 'P2000': {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          "The provided value for the column is too long for the column's type.",
      };
    }
    case 'P2001': {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message:
          'The record searched for in the where condition does not exist.',
      };
    }
    case 'P2004': {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'A constraint failed on the database.',
      };
    }
    default: {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
      };
    }
  }
};

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response | void => {
  logger.error(`[Error] ${getErrorName(err)}: ${getErrorMessage(err)}`);

  if (err instanceof ZodError) {
    return res.status(HttpStatus.BAD_REQUEST).json({
      status: 'error',
      message: 'Validation failed',
      errors: formatZodIssues(err),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const { statusCode, message } = mapPrismaException(err);
    return res.status(statusCode).json({
      status: 'error',
      message,
      code: err.code,
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
