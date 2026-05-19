import type { SentMessageInfo } from 'nodemailer';
import { HttpStatus } from '../../../../src/common/constants/http-status.constants';
import {
  EmailService,
  NodemailerService,
} from '../../../../src/integrations/email/email.service';

describe('email.service', () => {
  const sendMailMock = jest.fn();

  const createService = (): EmailService => {
    return new NodemailerService({
      emailUser: 'test@example.com',
      appBaseUrl: 'http://localhost:3000',
      transporter: {
        sendMail: sendMailMock,
      },
    });
  };

  beforeEach(() => {
    sendMailMock.mockReset();
  });

  it('sends release email and returns nodemailer result', async () => {
    const info = { messageId: 'message-1' } as SentMessageInfo;
    const service = createService();
    sendMailMock.mockResolvedValueOnce(info);

    const result = await service.sendReleaseEmail(
      'user@example.com',
      'owner/repo',
      'v1.0.0',
      '942ea92d-709c-40c2-a99b-fac2f13f4333',
    );

    expect(result).toEqual(info);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'New release in owner/repo: v1.0.0',
      }),
    );
  });

  it('sends confirmation email and returns nodemailer result', async () => {
    const info = { messageId: 'message-2' } as SentMessageInfo;
    const service = createService();
    sendMailMock.mockResolvedValueOnce(info);

    const result = await service.sendSubscriptionConfirmationEmail(
      'user@example.com',
      'owner/repo',
      'e4e12272-a4c3-4bcf-bf93-dce310adb871',
      '83534a6c-f173-45cf-b2da-2b9108399544',
    );

    expect(result).toEqual(info);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Confirm subscription for owner/repo',
      }),
    );
  });

  it('throws AppError(500) when mail sender fails', async () => {
    const service = createService();
    sendMailMock.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(
      service.sendReleaseEmail(
        'user@example.com',
        'owner/repo',
        'v1.0.0',
        '942ea92d-709c-40c2-a99b-fac2f13f4333',
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: expect.stringContaining('SMTP unavailable'),
    });
  });

  it('handles non-Error thrown values with Unknown error message', async () => {
    const service = createService();
    sendMailMock.mockRejectedValueOnce('bad value');

    await expect(
      service.sendSubscriptionConfirmationEmail(
        'user@example.com',
        'owner/repo',
        'e4e12272-a4c3-4bcf-bf93-dce310adb871',
        '83534a6c-f173-45cf-b2da-2b9108399544',
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Failed to send email to user@example.com: Unknown error',
    });
  });
});
