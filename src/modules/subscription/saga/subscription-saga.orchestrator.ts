import type { MessageHandler } from '../../../common/interfaces/message-handler.interface';
import type { SubscriptionNotificationEvent } from '../../notification/rabbitmq/saga/saga.contract';
import type { SubscriptionRepositoryInterface } from '../interfaces/subscription-repository.interface';
import { logger } from '../../../core/logger';

export class SubscriptionSagaOrchestrator implements MessageHandler<SubscriptionNotificationEvent> {
  constructor(
    private readonly subscriptionRepository: SubscriptionRepositoryInterface,
  ) {}

  async handle(event: SubscriptionNotificationEvent): Promise<void> {
    if (event.type === 'confirmation-failed') {
      logger.warn(
        { subscriptionId: event.subscriptionId, reason: event.reason },
        '[Saga Orchestrator] Asynchronous rollback triggered due to notification failure',
      );
      await this.subscriptionRepository.deleteById(event.subscriptionId);
      return;
    }

    logger.info(
      { subscriptionId: event.subscriptionId },
      '[Saga Orchestrator] Notification delivered, saga completed successfully',
    );
  }
}
