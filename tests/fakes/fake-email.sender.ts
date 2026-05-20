import { EmailMessage, EmailSenderPort } from '../../src/application/ports/email.sender.port';

export class FakeEmailSender implements EmailSenderPort {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> { this.sent.push(message); }
}

export class FailingEmailSender implements EmailSenderPort {
  async send(_: EmailMessage): Promise<void> { throw new Error('SMTP down'); }
}
