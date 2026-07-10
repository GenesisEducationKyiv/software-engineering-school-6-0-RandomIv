import type { NotificationPort } from '../../../common/interfaces/notification-port.interface';
import { httpClient } from '../../../common/utils/http-client.util';
import { AppError } from '../../../common/errors';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    const url = `${this.notificationUrl}${path}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await httpClient<void>(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          timeoutMs: REQUEST_TIMEOUT_MS,
        });
        return;
      } catch (error) {
        if (!this.isRetryable(error) || attempt === MAX_RETRIES) {
          throw error;
        }
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    return error instanceof AppError && error.statusCode >= 500;
  }
}
