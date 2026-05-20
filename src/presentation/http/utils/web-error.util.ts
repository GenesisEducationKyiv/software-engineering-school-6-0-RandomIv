import { Response } from 'express';
import { WebExceptionTranslatorRegistry } from '../error-translators/web-exception-translator.registry';
import { renderHtmlMessage } from '../views/html.template';

export const sendWebError = (
  res: Response,
  registry: WebExceptionTranslatorRegistry,
  error: unknown,
): void => {
  const page = registry.translate(error);
  res.status(page.status).send(renderHtmlMessage(page.title, page.message, true));
};
