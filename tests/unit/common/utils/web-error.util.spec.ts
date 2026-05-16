import { Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../../../src/common/errors';
import { sendWebError } from '../../../../src/common/utils/web-error.util';

const makeMockResponse = () => {
  const res = {
    status: jest.fn(),
    send: jest.fn(),
  } as unknown as Response;
  (res.status as jest.Mock).mockReturnValue(res);
  (res.send as jest.Mock).mockReturnValue(res);
  return res;
};

describe('web-error.util — sendWebError', () => {
  describe('AppError branch', () => {
    it('renders HTML with 4xx status and "Request failed" title', () => {
      const res = makeMockResponse();
      sendWebError(res, new AppError(404, 'Not found'));

      expect(res.status).toHaveBeenCalledWith(404);
      const html: string = (res.send as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Request failed');
      expect(html).toContain('Not found');
    });

    it('renders HTML with 5xx status and "Error" title', () => {
      const res = makeMockResponse();
      sendWebError(res, new AppError(500, 'Boom', false));

      expect(res.status).toHaveBeenCalledWith(500);
      const html: string = (res.send as jest.Mock).mock.calls[0][0];
      expect(html).toContain('<title>Error</title>');
      expect(html).toContain('Boom');
    });
  });

  describe('ZodError branch', () => {
    it('returns 400 with "Invalid link" HTML page', () => {
      const res = makeMockResponse();

      // Build a real ZodError via a failed parse
      const { error } = require('zod')
        .z.object({ token: require('zod').z.uuid() })
        .safeParse({ token: 'not-a-uuid' });

      sendWebError(res, error);

      expect(res.status).toHaveBeenCalledWith(400);
      const html: string = (res.send as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Invalid link');
      expect(html).toContain('The link is invalid or malformed.');
    });

    it('also accepts a manually constructed ZodError', () => {
      const res = makeMockResponse();
      const zodError = new ZodError([
        {
          code: 'custom',
          message: 'bad',
          path: ['token'],
        },
      ]);

      sendWebError(res, zodError);

      expect(res.status).toHaveBeenCalledWith(400);
      const html: string = (res.send as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Invalid link');
    });
  });

  describe('Unknown error fallback branch', () => {
    it('returns 500 with generic "Unexpected error" HTML page for a plain Error', () => {
      const res = makeMockResponse();
      sendWebError(res, new Error('something went wrong'));

      expect(res.status).toHaveBeenCalledWith(500);
      const html: string = (res.send as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Error');
      expect(html).toContain('Unexpected error. Please try again later.');
    });

    it('returns 500 for a completely unknown thrown value', () => {
      const res = makeMockResponse();
      sendWebError(res, 'raw string error');

      expect(res.status).toHaveBeenCalledWith(500);
      const html: string = (res.send as jest.Mock).mock.calls[0][0];
      expect(html).toContain('Unexpected error. Please try again later.');
    });
  });
});
