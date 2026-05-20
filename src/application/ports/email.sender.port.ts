export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSenderPort {
  send(message: EmailMessage): Promise<void>;
}
