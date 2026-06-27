import type { Transporter } from 'nodemailer';
import type { EmailTransport, SendMailOptions } from './email-transport.interface';

export class NodemailerEmailProvider implements EmailTransport {
  constructor(private readonly transporter: Transporter) {}

  async sendMail(options: SendMailOptions): Promise<void> {
    await this.transporter.sendMail(options);
  }
}
