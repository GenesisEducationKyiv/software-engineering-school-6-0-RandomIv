import amqp from 'amqplib';
import type { MessageHandler } from '../../common/interfaces/message-handler.interface';
import { logger } from '../logger';
import {
  assertDeadLetterQueue,
  deadLetterTopologyFor,
} from './rabbit-topology';

interface ChannelFactory {
  createChannel(): Promise<amqp.Channel>;
}

export interface RabbitConsumerOptions<T> {
  deadLetter?: boolean;
  parseMessage?: (raw: unknown) => T;
  maxAttempts?: number;
}

const MAX_SEEN_MESSAGE_IDS = 1000;
const DEFAULT_MAX_ATTEMPTS = 2;
const ATTEMPT_HEADER = 'x-attempt';

export class RabbitConsumer<T> {
  private readonly processedMessageIds = new Set<string>();

  constructor(
    private readonly rabbitmqUrl: string,
    private readonly queue: string,
    private readonly handler: MessageHandler<T>,
    private readonly options: RabbitConsumerOptions<T> = {},
  ) {}

  async start(): Promise<amqp.RecoveringChannelModel> {
    const model = await amqp.connect(this.rabbitmqUrl, { recovery: true });

    model.on('connect', (reconnected: amqp.ChannelModel) => {
      void this.setupChannel(reconnected);
    });

    await this.setupChannel(model);
    return model;
  }

  private async setupChannel(model: ChannelFactory): Promise<void> {
    const channel = await model.createChannel();

    if (this.options.deadLetter) {
      await assertDeadLetterQueue(channel, deadLetterTopologyFor(this.queue));
    } else {
      await channel.assertQueue(this.queue, { durable: true });
    }

    await channel.prefetch(1);

    await channel.consume(this.queue, (msg) => {
      void this.handleMessage(channel, msg);
    });

    logger.info(
      `[MQ Infrastructure] Consumer listening on queue "${this.queue}"`,
    );
  }

  private markProcessed(messageId: string): void {
    this.processedMessageIds.add(messageId);
    if (this.processedMessageIds.size > MAX_SEEN_MESSAGE_IDS) {
      this.processedMessageIds.delete(
        this.processedMessageIds.values().next().value!,
      );
    }
  }

  private getAttempt(msg: amqp.ConsumeMessage): number {
    const value: unknown = msg.properties?.headers?.[ATTEMPT_HEADER];
    return typeof value === 'number' ? value : 1;
  }

  private async handleMessage(
    channel: amqp.Channel,
    msg: amqp.ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) return;

    let payload: T;
    try {
      const raw: unknown = JSON.parse(msg.content.toString());
      payload = this.options.parseMessage
        ? this.options.parseMessage(raw)
        : (raw as T);
    } catch (error) {
      logger.error(
        { err: error },
        `[MQ Infrastructure] Failed to parse message from "${this.queue}"`,
      );
      channel.nack(msg, false, !msg.fields.redelivered);
      return;
    }

    const messageId =
      typeof msg.properties?.messageId === 'string'
        ? msg.properties.messageId
        : undefined;

    if (messageId && this.processedMessageIds.has(messageId)) {
      channel.ack(msg);
      logger.info(
        `[MQ Infrastructure] Duplicate message skipped on "${this.queue}"`,
      );
      return;
    }

    try {
      await this.handler.handle(payload);
      if (messageId) this.markProcessed(messageId);
      channel.ack(msg);
    } catch (error) {
      logger.error(
        { err: error },
        `[MQ Infrastructure] Handler failed for message from "${this.queue}"`,
      );

      const attempt = this.getAttempt(msg);
      const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

      if (attempt < maxAttempts) {
        channel.ack(msg);
        channel.sendToQueue(this.queue, msg.content, {
          persistent: true,
          ...(messageId ? { messageId } : {}),
          headers: {
            ...msg.properties?.headers,
            [ATTEMPT_HEADER]: attempt + 1,
          },
        });
        return;
      }

      try {
        await this.handler.onFailureExhausted?.(payload, error);
      } catch (compensationError) {
        logger.error(
          { err: compensationError },
          `[MQ Infrastructure] onFailureExhausted failed for message from "${this.queue}", will retry`,
        );
        channel.nack(msg, false, true);
        return;
      }

      if (this.options.deadLetter) {
        channel.nack(msg, false, false);
      } else {
        channel.ack(msg);
      }
    }
  }
}
