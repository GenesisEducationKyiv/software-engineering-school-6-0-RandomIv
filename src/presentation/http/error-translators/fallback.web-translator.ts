import { HttpStatus } from '../../../common/constants/http-status.constants';
import {
  WebErrorPage,
  WebExceptionTranslator,
} from './web-translator.port';

export class FallbackWebTranslator implements WebExceptionTranslator {
  canHandle(_: unknown): boolean {
    return true;
  }

  translate(_error: unknown): WebErrorPage {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Error',
      message: 'Unexpected error. Please try again later.',
    };
  }
}
