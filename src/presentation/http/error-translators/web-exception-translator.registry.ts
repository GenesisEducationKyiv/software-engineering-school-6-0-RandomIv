import {
  WebErrorPage,
  WebExceptionTranslator,
} from './web-translator.port';

export class WebExceptionTranslatorRegistry {
  constructor(private readonly translators: WebExceptionTranslator[]) {}

  translate(error: unknown): WebErrorPage {
    const translator = this.translators.find((t) => t.canHandle(error));
    if (!translator) {
      throw new Error(
        'No web exception translator could handle the error - add a fallback translator',
      );
    }
    return translator.translate(error);
  }
}
