import { promisify } from 'node:util';
import * as grpc from '@grpc/grpc-js';
import type { ConfirmationPort } from '../../../common/interfaces/confirmation-port.interface';
import type { ReleaseNotificationPort } from '../../../common/interfaces/release-notification-port.interface';
import { NotificationServiceClient } from '../../../generated/v1/notification';

export class GrpcNotificationProvider
  implements ConfirmationPort, ReleaseNotificationPort
{
  private readonly client: NotificationServiceClient;

  constructor(address: string) {
    this.client = new NotificationServiceClient(
      address,
      grpc.credentials.createInsecure(),
    );
  }

  async sendConfirmation(
    _subscriptionId: string,
    to: string,
    repo: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    const sendConfirmation = promisify(
      this.client.sendConfirmation.bind(this.client),
    );
    await sendConfirmation({ to, repo, confirmationUrl, unsubscribeUrl });
  }

  async sendRelease(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    const sendRelease = promisify(this.client.sendRelease.bind(this.client));
    await sendRelease({ to, repo, tag, releaseUrl, unsubscribeUrl });
  }

  close(): void {
    this.client.close();
  }
}
