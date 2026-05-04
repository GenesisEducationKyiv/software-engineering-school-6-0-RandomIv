import { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { renderHtmlMessage } from '../views/html.template';

export const sendWebError = (res: Response, error: unknown): void => {
  if (error instanceof AppError) {
    const title = error.statusCode >= 500 ? 'Error' : 'Request failed';
    res
      .status(error.statusCode)
      .send(renderHtmlMessage(title, error.message, true));
    return;
  }

  if (error instanceof ZodError) {
    res
      .status(400)
      .send(
        renderHtmlMessage(
          'Invalid link',
          'The link is invalid or malformed.',
          true,
        ),
      );
    return;
  }

  res
    .status(500)
    .send(
      renderHtmlMessage(
        'Error',
        'Unexpected error. Please try again later.',
        true,
      ),
    );
};
