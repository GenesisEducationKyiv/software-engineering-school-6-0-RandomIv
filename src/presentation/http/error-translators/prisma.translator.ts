import { Prisma } from '../../../generated/prisma/client';
import {
  ExceptionTranslator,
  HttpErrorResponse,
} from './exception-translator.port';
import { HttpStatus } from '../../../common/constants/http-status.constants';

interface PrismaMeta extends Record<string, unknown> {
  target?: string[];
  constraint?: string;
  field_name?: string;
}

const constraintName = (m: PrismaMeta): string | undefined =>
  (typeof m.constraint === 'string' && m.constraint) ||
  (typeof m.field_name === 'string' && m.field_name) ||
  undefined;

const constraintField = (m: PrismaMeta): string | undefined => {
  const c = constraintName(m);
  if (!c) return undefined;
  return c.includes('_') ? c.split('_')[1] : c;
};

const targetFields = (m: PrismaMeta): string | undefined =>
  Array.isArray(m.target) && m.target.length > 0
    ? m.target.join(', ')
    : undefined;

const fieldsFromMessage = (message: string): string | undefined => {
  const fields = message.match(/fields?:\s*\(([^)]+)\)/i);
  if (fields?.[1]) {
    const cleaned = fields[1]
      .split(',')
      .map((p) => p.replace(/[`"']/g, '').trim())
      .filter(Boolean)
      .join(', ');
    return cleaned || undefined;
  }
  const constraint = message.match(/constraint\s*`([^`]+)`/i);
  return constraint?.[1];
};

export class PrismaExceptionTranslator implements ExceptionTranslator {
  canHandle(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return error instanceof Prisma.PrismaClientKnownRequestError;
  }

  translate(error: Prisma.PrismaClientKnownRequestError): HttpErrorResponse {
    const meta = (error.meta ?? {}) as PrismaMeta;
    const make = (status: number, message: string): HttpErrorResponse => ({
      status,
      body: { status: 'error', message, code: error.code },
    });

    switch (error.code) {
      case 'P2003':
        return make(
          HttpStatus.BAD_REQUEST,
          `Foreign key constraint failed: ${constraintField(meta) ?? 'unknown field'} does not reference an existing record`,
        );
      case 'P2002': {
        const fields =
          targetFields(meta) ??
          constraintName(meta) ??
          fieldsFromMessage(error.message);
        return make(
          HttpStatus.CONFLICT,
          fields
            ? `Unique constraint failed on: ${fields}`
            : 'Unique constraint failed',
        );
      }
      case 'P2025':
        return make(HttpStatus.NOT_FOUND, 'Record not found');
      case 'P2000':
        return make(
          HttpStatus.BAD_REQUEST,
          "The provided value for the column is too long for the column's type.",
        );
      case 'P2001':
        return make(
          HttpStatus.NOT_FOUND,
          'The record searched for in the where condition does not exist.',
        );
      case 'P2004':
        return make(
          HttpStatus.BAD_REQUEST,
          'A constraint failed on the database.',
        );
      default:
        return make(HttpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
  }
}
