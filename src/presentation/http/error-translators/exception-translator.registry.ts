import {
  ExceptionTranslator,
  HttpErrorResponse,
} from './exception-translator.port';

export class ExceptionTranslatorRegistry {
  constructor(private readonly translators: ExceptionTranslator[]) {}

  translate(error: unknown): HttpErrorResponse {
    const translator = this.translators.find((t) => t.canHandle(error));
    if (!translator) {
      throw new Error(
        'No exception translator could handle the error - add a fallback translator',
      );
    }
    return translator.translate(error);
  }
}
