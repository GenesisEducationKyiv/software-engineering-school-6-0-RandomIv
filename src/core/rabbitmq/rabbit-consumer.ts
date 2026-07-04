import amqp from 'amqplib';
import type { MessageHandler } from '../../common/interfaces/message-handler.interface';
import { logger } from '../logger';

interface ChannelFactory {
  createChannel(): Promise<amqp.Channel>;
}

export class RabbitConsumer<T> {
  constructor(
    private readonly rabbitmqUrl: string,
    private readonly queue: string,
    private readonly handler: MessageHandler<T>,
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
    await channel.assertQueue(this.queue, { durable: true });
    await channel.prefetch(1);

    await channel.consume(this.queue, (msg) => {
      void this.handleMessage(channel, msg);
    });

    logger.info(`[MQ Infrastructure] Consumer listening on queue "${this.queue}"`);
  }

  private async handleMessage(channel: amqp.Channel, msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let payload: T;
    try {
      payload = JSON.parse(msg.content.toString()) as T;
    } catch (error) {
      logger.error({ err: error }, `[MQ Infrastructure] Failed to parse message from "${this.queue}"`);
      channel.nack(msg, false, !msg.fields.redelivered);
      return;
    }

    try {
      await this.handler.handle(payload);
      channel.ack(msg);
    } catch (error) {
      logger.error({ err: error }, `[MQ Infrastructure] Handler failed for message from "${this.queue}"`);

      if (!msg.fields.redelivered) {
        channel.nack(msg, false, true);
        return;
      }

      await this.handler.onFailureExhausted?.(payload, error);
      channel.ack(msg);
    }
  }
}
