import type { MessageHandler } from '../../../common/interfaces/message-handler.interface';
import type { NotificationChannel } from '../delivery/notification-channel.interface';
import type { NotificationMessage } from './rabbitmq.contract';
import { logger } from '../../../core/logger';

export class NotificationMessageHandler implements MessageHandler<NotificationMessage> {
  constructor(private readonly deliveryChannel: NotificationChannel) {}

  async handle(message: NotificationMessage): Promise<void> {
    if (message.type === 'confirmation') {
      await this.deliveryChannel.sendConfirmation(
        message.to,
        message.repo,
        message.confirmationUrl,
        message.unsubscribeUrl,
      );
    } else {
      await this.deliveryChannel.sendRelease(
        message.to,
        message.repo,
        message.tag,
        message.releaseUrl,
        message.unsubscribeUrl,
      );
    }
    logger.info(
      { type: message.type },
      '[MQ Handler] Notification processed successfully',
    );
  }
}
