import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';
import type { NotificationPort } from '../../../common/interfaces/notification-port.interface';
import { logger } from '../../../core/logger';
import {
  NOTIFICATION_QUEUE,
  type NotificationMessage,
  setupNotificationTopology,
} from './rabbitmq.contract';

export class MqNotificationProvider implements NotificationPort {
  private model: amqp.RecoveringChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private readonly rabbitmqUrl: string) {}

  async sendConfirmation(
    to: string,
    repo: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.publish({
      type: 'confirmation',
      to,
      repo,
      confirmationUrl,
      unsubscribeUrl,
    });
  }

  async sendRelease(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.publish({
      type: 'release',
      to,
      repo,
      tag,
      releaseUrl,
      unsubscribeUrl,
    });
  }

  private async publish(message: NotificationMessage): Promise<void> {
    const ch = await this.getChannel();
    ch.sendToQueue(NOTIFICATION_QUEUE, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      messageId: randomUUID(),
    });
    logger.info({ type: message.type }, '[MQ] Message published');
  }

  private async getChannel(): Promise<amqp.Channel> {
    if (this.channel) return this.channel;

    if (!this.model) {
      this.model = await amqp.connect(this.rabbitmqUrl, { recovery: true });
    }

    const ch = await this.model.createChannel();
    await setupNotificationTopology(ch);
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
