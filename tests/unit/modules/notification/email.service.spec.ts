import type { SentMessageInfo } from 'nodemailer';
import { HttpStatus } from '../../../../src/common/constants/http-status.constants';

const sendMailMock = jest.fn();
const createTransportMock = jest.fn();

const loadEmailService = async () => {
  jest.resetModules();
  createTransportMock.mockReturnValue({
    sendMail: sendMailMock,
  });

  jest.doMock('nodemailer', () => ({
    __esModule: true,
    default: {
      createTransport: createTransportMock,
    },
  }));

  return import('../../../../src/modules/notification/email.service');
};

describe('email.service', () => {
  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockReset();
  });

  it('sends release email and returns nodemailer result', async () => {
    const info = { messageId: 'message-1' } as SentMessageInfo;

    const { sendReleaseEmail } = await loadEmailService();
    sendMailMock.mockResolvedValueOnce(info);
    const result = await sendReleaseEmail(
      'user@example.com',
      'owner/repo',
      'v1.0.0',
      '942ea92d-709c-40c2-a99b-fac2f13f4333',
    );

    expect(result).toEqual(info);
    expect(createTransportMock).toHaveBeenCalledWith({
      service: 'gmail',
      auth: {
        user: 'test@example.com',
        pass: 'test-password',
      },
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'New release in owner/repo: v1.0.0',
      }),
    );
  });

  it('sends confirmation email and returns nodemailer result', async () => {
    const info = { messageId: 'message-2' } as SentMessageInfo;

    const { sendSubscriptionConfirmationEmail } = await loadEmailService();
    sendMailMock.mockResolvedValueOnce(info);
    const result = await sendSubscriptionConfirmationEmail(
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

  it('throws AppError(500) when nodemailer fails', async () => {
    const { sendReleaseEmail } = await loadEmailService();
    sendMailMock.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(
      sendReleaseEmail(
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
    const { sendSubscriptionConfirmationEmail } = await loadEmailService();
    sendMailMock.mockRejectedValueOnce('bad value');

    await expect(
      sendSubscriptionConfirmationEmail(
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
