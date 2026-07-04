import type { ConfirmationPort } from '../../../common/interfaces/confirmation-port.interface';
import type { ReleaseNotificationPort } from '../../../common/interfaces/release-notification-port.interface';
import type { MessagePublisher } from '../../../common/interfaces/message-publisher.interface';
import type { NotificationMessage } from './rabbitmq.contract';

export class RabbitMqProvider
  implements ConfirmationPort, ReleaseNotificationPort
{
  constructor(
    private readonly publisher: MessagePublisher<NotificationMessage>,
  ) {}

  async sendConfirmation(
    id: string,
    to: string,
    repo: string,
    confUrl: string,
    unsubUrl: string,
  ): Promise<void> {
    await this.publisher.publish({
      type: 'confirmation',
      to,
      repo,
      confirmationUrl: confUrl,
      unsubscribeUrl: unsubUrl,
    });
  }

  async sendRelease(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubUrl: string,
  ): Promise<void> {
    await this.publisher.publish({
      type: 'release',
      to,
      repo,
      tag,
      releaseUrl,
      unsubscribeUrl: unsubUrl,
    });
  }
}
