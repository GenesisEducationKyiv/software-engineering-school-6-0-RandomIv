import amqp from 'amqplib';
import type { MessagePublisher } from '../../common/interfaces/message-publisher.interface';

export class RabbitMessagePublisher<T> implements MessagePublisher<T> {
  private model: amqp.RecoveringChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(
    private readonly rabbitmqUrl: string,
    private readonly queue: string,
  ) {}

  async publish(message: T): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;

    if (!this.model) {
      this.model = await amqp.connect(this.rabbitmqUrl, { recovery: true });
    }

    const channel = await this.model.createChannel();
    await channel.assertQueue(this.queue, { durable: true });

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
