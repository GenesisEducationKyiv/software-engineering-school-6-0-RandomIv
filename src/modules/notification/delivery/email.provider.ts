import type { NotificationChannel } from './notification-channel.interface';
import type { EmailService } from '../../../integrations/email/email.service';

export class EmailNotificationProvider implements NotificationChannel {
  constructor(private readonly emailService: EmailService) {}

  async sendConfirmation(
    to: string,
    repo: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.emailService.sendSubscriptionConfirmationEmail(
      to,
      repo,
      confirmationUrl,
      unsubscribeUrl,
    );
  }

  async sendRelease(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.emailService.sendReleaseEmail(
      to,
      repo,
      tag,
      releaseUrl,
      unsubscribeUrl,
    );
  }
}
