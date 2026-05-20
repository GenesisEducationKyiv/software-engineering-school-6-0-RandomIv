import { AppError } from '../../../domain/errors';
import {
  ExceptionTranslator,
  HttpErrorResponse,
} from './exception-translator.port';

export class AppErrorTranslator implements ExceptionTranslator {
  canHandle(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  translate(error: AppError): HttpErrorResponse {
    return {
      status: error.statusCode,
      body: { status: 'error', message: error.message },
    };
  }
}
