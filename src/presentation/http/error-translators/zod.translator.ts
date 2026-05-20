import { ZodError, ZodIssue } from 'zod';
import {
  ExceptionTranslator,
  HttpErrorResponse,
} from './exception-translator.port';
import { HttpStatus } from '../../../common/constants/http-status.constants';

const issuePath = (issue: ZodIssue): string =>
  issue.path.length === 0 ? 'body' : issue.path.map(String).join('.');

export class ZodExceptionTranslator implements ExceptionTranslator {
  canHandle(error: unknown): error is ZodError {
    return error instanceof ZodError;
  }

  translate(error: ZodError): HttpErrorResponse {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        status: 'error',
        message: 'Validation failed',
        errors: error.issues.map((issue) => ({
          field: issuePath(issue),
          message: issue.message,
          code: issue.code,
        })),
      },
    };
  }
}
