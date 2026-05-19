import type { SentMessageInfo, Transporter } from 'nodemailer';
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
      transporter: {
        sendMail: sendMailMock,
      } as unknown as Transporter,
    });
  };

  beforeEach(() => {
    sendMailMock.mockReset();
  });

  it('sends release email', async () => {
    const info = { messageId: 'message-1' } as SentMessageInfo;
    const service = createService();
    sendMailMock.mockResolvedValueOnce(info);

    await service.sendReleaseEmail(
      'user@example.com',
      'owner/repo',
      'v1.0.0',
      'https://github.com/owner/repo/releases/tag/v1.0.0',
      'https://app.example.com/web/unsubscribe/token-1',
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'New release in owner/repo: v1.0.0',
      }),
    );
  });

  it('sends confirmation email', async () => {
    const info = { messageId: 'message-2' } as SentMessageInfo;
    const service = createService();
    sendMailMock.mockResolvedValueOnce(info);

    await service.sendSubscriptionConfirmationEmail(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/web/confirm/token-2',
      'https://app.example.com/web/unsubscribe/token-3',
    );

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
        'https://github.com/owner/repo/releases/tag/v1.0.0',
        'https://app.example.com/web/unsubscribe/token-4',
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
        'https://app.example.com/web/confirm/token-5',
        'https://app.example.com/web/unsubscribe/token-6',
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Failed to send email to user@example.com: Unknown error',
    });
  });
});
