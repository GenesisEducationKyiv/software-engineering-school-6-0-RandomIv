import { ZodError } from 'zod';
import { HttpStatus } from '../../../common/constants/http-status.constants';
import {
  WebErrorPage,
  WebExceptionTranslator,
} from './web-translator.port';

export class ZodWebTranslator implements WebExceptionTranslator {
  canHandle(error: unknown): error is ZodError {
    return error instanceof ZodError;
  }

  translate(_error: ZodError): WebErrorPage {
    return {
      status: HttpStatus.BAD_REQUEST,
      title: 'Invalid link',
      message: 'The link is invalid or malformed.',
    };
  }
}
