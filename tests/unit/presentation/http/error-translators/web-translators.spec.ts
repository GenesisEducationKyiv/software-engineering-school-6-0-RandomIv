import { z } from 'zod';
import { AppError } from '../../../../../src/domain/errors';
import { HttpStatus } from '../../../../../src/common/constants/http-status.constants';
import { WebExceptionTranslatorRegistry } from '../../../../../src/presentation/http/error-translators/web-exception-translator.registry';
import { AppErrorWebTranslator } from '../../../../../src/presentation/http/error-translators/app-error.web-translator';
import { ZodWebTranslator } from '../../../../../src/presentation/http/error-translators/zod.web-translator';
import { FallbackWebTranslator } from '../../../../../src/presentation/http/error-translators/fallback.web-translator';

const buildRegistry = (): WebExceptionTranslatorRegistry =>
  new WebExceptionTranslatorRegistry([
    new ZodWebTranslator(),
    new AppErrorWebTranslator(),
    new FallbackWebTranslator(),
  ]);

describe('Web exception translators', () => {
  describe('ZodWebTranslator', () => {
    const translator = new ZodWebTranslator();

    it('canHandle returns true for ZodError', () => {
      let validationError: unknown;
      try {
        z.object({ email: z.email() }).parse({ email: 'bad-email' });
      } catch (error) {
        validationError = error;
      }

      expect(translator.canHandle(validationError)).toBe(true);
    });

    it('canHandle returns false for non-ZodError', () => {
      expect(translator.canHandle(new Error('boom'))).toBe(false);
      expect(translator.canHandle(new AppError(404, 'missing'))).toBe(false);
    });

    it('maps ZodError to 400 Invalid link page', () => {
      let validationError: unknown;
      try {
        z.object({ email: z.email() }).parse({ email: 'bad-email' });
      } catch (error) {
        validationError = error;
      }

      const page = buildRegistry().translate(validationError);
      expect(page).toEqual({
        status: HttpStatus.BAD_REQUEST,
        title: 'Invalid link',
        message: 'The link is invalid or malformed.',
      });
    });
  });

  describe('AppErrorWebTranslator', () => {
    const translator = new AppErrorWebTranslator();

    it('canHandle returns true for AppError instances', () => {
      expect(translator.canHandle(new AppError(404, 'missing'))).toBe(true);
    });

    it('canHandle returns false for plain Error', () => {
      expect(translator.canHandle(new Error('boom'))).toBe(false);
    });

    it('uses "Request failed" title when statusCode < 500', () => {
      const err = new AppError(404, 'Not found');
      const page = buildRegistry().translate(err);
      expect(page).toEqual({
        status: 404,
        title: 'Request failed',
        message: 'Not found',
      });
    });

    it('uses "Error" title when statusCode >= 500', () => {
      const err = new AppError(503, 'Service unavailable');
      const page = buildRegistry().translate(err);
      expect(page).toEqual({
        status: 503,
        title: 'Error',
        message: 'Service unavailable',
      });
    });

    it('uses "Error" title at the 500 boundary', () => {
      const err = new AppError(500, 'Internal error');
      const page = buildRegistry().translate(err);
      expect(page.title).toBe('Error');
      expect(page.status).toBe(500);
    });
  });

  describe('FallbackWebTranslator', () => {
    const translator = new FallbackWebTranslator();

    it('canHandle returns true for any value', () => {
      expect(translator.canHandle(new Error('boom'))).toBe(true);
      expect(translator.canHandle({ foo: 'bar' })).toBe(true);
      expect(translator.canHandle(undefined)).toBe(true);
    });

    it('falls back to 500 generic page for unknown error', () => {
      const page = buildRegistry().translate(new Error('Unexpected'));
      expect(page).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: 'Error',
        message: 'Unexpected error. Please try again later.',
      });
    });

    it('falls back to 500 generic page for non-Error values', () => {
      const page = buildRegistry().translate({ random: 'thing' });
      expect(page).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: 'Error',
        message: 'Unexpected error. Please try again later.',
      });
    });
  });
});
