import type { MessageHandler } from '../../../common/interfaces/message-handler.interface';
import type { MessagePublisher } from '../../../common/interfaces/message-publisher.interface';
import type { NotificationChannel } from '../delivery/notification-channel.interface';
import type { SendConfirmationEmailCommand, SubscriptionSagaEvent } from '../../subscription/saga/subscription-saga.contract';
import { logger } from '../../../core/logger';

export class SagaCommandHandler implements MessageHandler<SendConfirmationEmailCommand> {
  constructor(
    private readonly deliveryChannel: NotificationChannel,
    private readonly sagaEventPublisher: MessagePublisher<SubscriptionSagaEvent>,
  ) {}

  async handle(command: SendConfirmationEmailCommand): Promise<void> {
    // 1. Виконуємо відправку листа
    await this.deliveryChannel.sendConfirmation(
      command.email,
      command.repo,
      command.confirmationUrl,
      command.unsubscribeUrl,
    );

    // 2. Звітуємо оркестратору про успіх!
    await this.sagaEventPublisher.publish({
      type: 'confirmation-email-sent',
      subscriptionId: command.subscriptionId,
    });
    logger.info({ subscriptionId: command.subscriptionId }, '[Saga Handler] Confirmation email sent and success event published');
  }

  // Спрацює автоматично, якщо Nodemailer впаде двічі поспіль
  async onFailureExhausted(command: SendConfirmationEmailCommand, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : 'Unknown error';

    // 3. Компенсація Саги: пушимо в чергу подій рапорт про смерть пошти
    await this.sagaEventPublisher.publish({
      type: 'confirmation-email-failed',
      subscriptionId: command.subscriptionId,
      reason,
    });
    logger.warn({ subscriptionId: command.subscriptionId, reason }, '[Saga Handler] Max retries exhausted, published failure event');
  }
}
