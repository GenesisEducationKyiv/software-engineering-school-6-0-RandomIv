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
      const deleted = await this.subscriptionRepository.deleteById(
        event.subscriptionId,
      );
      if (deleted === 0) {
        logger.info(
          { subscriptionId: event.subscriptionId },
          '[Saga Orchestrator] Compensation skipped, subscription already confirmed or removed',
        );
      }
      return;
    }

    logger.info(
      { subscriptionId: event.subscriptionId },
      '[Saga Orchestrator] Notification delivered, saga completed successfully',
    );
  }
}
