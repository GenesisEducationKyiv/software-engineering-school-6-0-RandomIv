import amqp from 'amqplib';
import type { SubscriptionSaga } from './subscription-saga.interface';
import type {
  SendConfirmationEmailCommand,
  SubscriptionSagaEvent,
} from './subscription-saga.contract';
import { SEND_CONFIRMATION_COMMAND_QUEUE } from './subscription-saga.contract';
import type { SubscriptionRepositoryInterface } from '../interfaces/subscription-repository.interface';
import { logger } from '../../../core/logger';

export class SubscriptionSagaOrchestrator implements SubscriptionSaga {
  private model: amqp.RecoveringChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(
    private readonly rabbitmqUrl: string,
    private readonly subscriptionRepository: SubscriptionRepositoryInterface,
  ) {}

  async start(input: SendConfirmationEmailCommand): Promise<void> {
    const ch = await this.getChannel();
    ch.sendToQueue(
      SEND_CONFIRMATION_COMMAND_QUEUE,
      Buffer.from(JSON.stringify(input)),
      { persistent: true },
    );
    logger.info(
      { subscriptionId: input.subscriptionId },
      '[Saga] SendConfirmationEmail command published',
    );
  }

  async handleEvent(event: SubscriptionSagaEvent): Promise<void> {
    if (event.type === 'confirmation-email-failed') {
      logger.warn(
        { subscriptionId: event.subscriptionId, reason: event.reason },
        '[Saga] Compensating: deleting subscription',
      );
      await this.subscriptionRepository.deleteById(event.subscriptionId);
      return;
    }

    logger.info(
      { subscriptionId: event.subscriptionId },
      '[Saga] Confirmation email sent, saga complete',
    );
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;

    if (!this.model) {
      this.model = await amqp.connect(this.rabbitmqUrl, { recovery: true });
    }

    const ch = await this.model.createChannel();
    await ch.assertQueue(SEND_CONFIRMATION_COMMAND_QUEUE, { durable: true });
    ch.on('error', () => {
      this.channel = null;
    });
    ch.on('close', () => {
      this.channel = null;
    });
    this.channel = ch;
    return this.channel;
  }
}
