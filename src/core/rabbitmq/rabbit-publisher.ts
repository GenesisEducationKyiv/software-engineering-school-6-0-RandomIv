import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import type { MessagePublisher } from '../../common/interfaces/message-publisher.interface';
import {
  assertDeadLetterQueue,
  deadLetterTopologyFor,
} from './rabbit-topology';

export interface RabbitMessagePublisherOptions {
  deadLetter?: boolean;
}

export class RabbitMessagePublisher<T> implements MessagePublisher<T> {
  private model: amqp.RecoveringChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(
    private readonly rabbitmqUrl: string,
    private readonly queue: string,
    private readonly options: RabbitMessagePublisherOptions = {},
  ) {}

  async publish(message: T): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      messageId: randomUUID(),
    });
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;

    if (!this.model) {
      this.model = await amqp.connect(this.rabbitmqUrl, { recovery: true });
    }

    const channel = await this.model.createChannel();

    if (this.options.deadLetter) {
      await assertDeadLetterQueue(channel, deadLetterTopologyFor(this.queue));
    } else {
      await channel.assertQueue(this.queue, { durable: true });
    }

    channel.on('error', () => {
      this.channel = null;
    });
    channel.on('close', () => {
      this.channel = null;
    });

    this.channel = channel;
    return this.channel;
  }
}
