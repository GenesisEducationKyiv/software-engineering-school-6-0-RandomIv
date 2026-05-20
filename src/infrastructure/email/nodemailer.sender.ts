import nodemailer, { Transporter } from 'nodemailer';
import { EmailMessage, EmailSenderPort } from '../../application/ports/email.sender.port';
import { AppError } from '../../domain/errors';
import { HttpStatus } from '../../common/constants/http-status.constants';

export const createNodemailerTransport = (
  user: string,
  pass: string,
): Transporter => nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass },
});

export class NodemailerEmailSender implements EmailSenderPort {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"GitHub Release Notifier" <${this.from}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        `Failed to send email to ${message.to}: ${reason}`,
      );
    }
  }
}
