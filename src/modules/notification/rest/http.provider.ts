import type { ConfirmationPort } from '../../../common/interfaces/confirmation-port.interface';
import type { ReleaseNotificationPort } from '../../../common/interfaces/release-notification-port.interface';
import { httpClient } from '../../../common/utils/http-client.util';

export class HttpNotificationProvider
  implements ConfirmationPort, ReleaseNotificationPort
{
  constructor(private readonly notificationUrl: string) {}

  async sendConfirmation(
    _subscriptionId: string,
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
    await httpClient<void>(`${this.notificationUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}
