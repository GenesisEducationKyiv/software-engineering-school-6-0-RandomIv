import {
  ExceptionTranslator,
  HttpErrorResponse,
} from './exception-translator.port';
import { HttpStatus } from '../../../common/constants/http-status.constants';

export class FallbackExceptionTranslator implements ExceptionTranslator {
  constructor(private readonly includeStack: boolean) {}

  canHandle(_: unknown): boolean {
    return true;
  }

  translate(error: unknown): HttpErrorResponse {
    const stack = error instanceof Error ? error.stack : undefined;
    const body: Record<string, unknown> = {
      status: 'error',
      message: 'Internal Server Error',
    };
    if (this.includeStack && stack) body.stack = stack;
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body };
  }
}
