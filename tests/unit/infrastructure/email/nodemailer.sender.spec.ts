import { NodemailerEmailSender } from '../../../../src/infrastructure/email/nodemailer.sender';
import { AppError } from '../../../../src/domain/errors';

describe('NodemailerEmailSender', () => {
  it('calls transporter.sendMail with from + message', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new NodemailerEmailSender({ sendMail } as never, 'sender@x');

    await sender.send({ to: 'a@b.c', subject: 's', text: 't', html: '<p>h</p>' });

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: '"GitHub Release Notifier" <sender@x>',
      to: 'a@b.c',
      subject: 's',
      text: 't',
      html: '<p>h</p>',
    }));
  });

  it('wraps transport errors in AppError', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP down'));
    const sender = new NodemailerEmailSender({ sendMail } as never, 'sender@x');
    await expect(
      sender.send({ to: 'a@b.c', subject: 's', text: 't', html: 'h' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
