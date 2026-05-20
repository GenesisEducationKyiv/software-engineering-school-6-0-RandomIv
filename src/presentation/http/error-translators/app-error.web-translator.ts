import { AppError } from '../../../domain/errors';
import {
  WebErrorPage,
  WebExceptionTranslator,
} from './web-translator.port';

export class AppErrorWebTranslator implements WebExceptionTranslator {
  canHandle(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  translate(error: AppError): WebErrorPage {
    const title = error.statusCode >= 500 ? 'Error' : 'Request failed';
    return {
      status: error.statusCode,
      title,
      message: error.message,
    };
  }
}
