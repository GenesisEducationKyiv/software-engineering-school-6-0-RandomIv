import type { MessageHandler } from '../../../../common/interfaces/message-handler.interface';
import type { MessagePublisher } from '../../../../common/interfaces/message-publisher.interface';
import type { NotificationChannel } from '../../delivery/notification-channel.interface';
import type {
  SendConfirmationCommand,
  SubscriptionNotificationEvent,
} from './saga.contract';
import { logger } from '../../../../core/logger';

export class SendConfirmationCommandHandler implements MessageHandler<SendConfirmationCommand> {
  constructor(
    private readonly deliveryChannel: NotificationChannel,
    private readonly eventPublisher: MessagePublisher<SubscriptionNotificationEvent>,
  ) {}

  async handle(command: SendConfirmationCommand): Promise<void> {
    await this.deliveryChannel.sendConfirmation(
      command.to,
      command.repo,
      command.confirmationUrl,
      command.unsubscribeUrl,
    );

    await this.eventPublisher.publish({
      type: 'confirmation-sent',
      subscriptionId: command.subscriptionId,
    });
    logger.info(
      { subscriptionId: command.subscriptionId },
      '[Notification] Confirmation sent and success event published',
    );
  }

  async onFailureExhausted(
    command: SendConfirmationCommand,
    error: unknown,
  ): Promise<void> {
    const reason = error instanceof Error ? error.message : 'Unknown error';

    await this.eventPublisher.publish({
      type: 'confirmation-failed',
      subscriptionId: command.subscriptionId,
      reason,
    });
    logger.warn(
      { subscriptionId: command.subscriptionId, reason },
      '[Notification] Max retries exhausted, published failure event',
    );
  }
}
