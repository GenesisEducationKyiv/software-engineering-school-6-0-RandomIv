import type { NotificationPort } from '../../../common/interfaces/notification-port.interface';
import { AppError } from '../../../common/errors';
import { HttpStatus } from '../../../common/constants/http-status.constant';

export class HttpNotificationProvider implements NotificationPort {
  constructor(private readonly notificationUrl: string) {}

  async sendConfirmation(
    to: string,
    repo: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.post('/send-confirmation', {
      to,
      repo,
      confirmationUrl,
      unsubscribeUrl,
    });
  }

  async sendRelease(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.post('/send-release', {
      to,
      repo,
      tag,
      releaseUrl,
      unsubscribeUrl,
    });
  }

  private async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.notificationUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        `Notification service error: ${response.status}`,
      );
    }
  }
}
