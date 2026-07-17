import type { MessageHandler } from '../../../common/interfaces/message-handler.interface';
import type { MessagePublisher } from '../../../common/interfaces/message-publisher.interface';
import type {
  SendConfirmationCommand,
  SubscriptionNotificationEvent,
} from '../../notification/rabbitmq/saga/saga.contract';
import type { SubscriptionRepositoryInterface } from '../interfaces/subscription-repository.interface';
import type {
  SubscriptionSagaContext,
  SubscriptionSagaStarter,
} from '../interfaces/subscription-saga-starter.interface';
import { logger } from '../../../core/logger';

export class SubscriptionSagaOrchestrator
  implements
    SubscriptionSagaStarter,
    MessageHandler<SubscriptionNotificationEvent>
{
  constructor(
    private readonly commandPublisher: MessagePublisher<SendConfirmationCommand>,
    private readonly subscriptionRepository: SubscriptionRepositoryInterface,
  ) {}

  async start(context: SubscriptionSagaContext): Promise<void> {
    logger.info(
      { subscriptionId: context.subscriptionId },
      '[Saga Orchestrator] Starting saga, dispatching confirmation command',
    );

    try {
      await this.commandPublisher.publish({
        subscriptionId: context.subscriptionId,
        to: context.to,
        repo: context.repo,
        confirmationUrl: context.confirmationUrl,
        unsubscribeUrl: context.unsubscribeUrl,
      });
    } catch (error) {
      logger.error(
        { subscriptionId: context.subscriptionId, err: error },
        '[Saga Orchestrator] Failed to dispatch command, compensating',
      );
      await this.subscriptionRepository.deleteById(context.subscriptionId);
      throw error;
    }
  }

  async handle(event: SubscriptionNotificationEvent): Promise<void> {
    if (event.type === 'confirmation-failed') {
      logger.warn(
        { subscriptionId: event.subscriptionId, reason: event.reason },
        '[Saga Orchestrator] Confirmation failed, compensating',
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
      '[Saga Orchestrator] Confirmation delivered, saga completed successfully',
    );
  }
}
