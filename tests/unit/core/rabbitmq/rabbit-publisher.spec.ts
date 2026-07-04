import amqp from 'amqplib';
import { RabbitMessagePublisher } from '../../../../src/core/rabbitmq/rabbit-publisher';

jest.mock('amqplib');

describe('rabbit-publisher', () => {
  const sendToQueue = jest.fn();
  const assertQueue = jest.fn();
  const channelOn = jest.fn();
  const createChannel = jest.fn();

  const channel = { assertQueue, sendToQueue, on: channelOn };
  const model = { createChannel };

  beforeEach(() => {
    assertQueue.mockResolvedValue(undefined);
    createChannel.mockResolvedValue(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(model);
  });

  it('connects, asserts the queue durable, and publishes with persistent:true', async () => {
    const publisher = new RabbitMessagePublisher<{ hello: string }>(
      'amqp://localhost',
      'my-queue',
    );

    await publisher.publish({ hello: 'world' });

    expect(amqp.connect).toHaveBeenCalledWith('amqp://localhost', {
      recovery: true,
    });
    expect(assertQueue).toHaveBeenCalledWith('my-queue', { durable: true });
    expect(sendToQueue).toHaveBeenCalledWith(
      'my-queue',
      Buffer.from(JSON.stringify({ hello: 'world' })),
      { persistent: true },
    );
  });

  it('reuses the same connection and channel across multiple publishes', async () => {
    const publisher = new RabbitMessagePublisher<{ n: number }>(
      'amqp://localhost',
      'my-queue',
    );

    await publisher.publish({ n: 1 });
    await publisher.publish({ n: 2 });

    expect(amqp.connect).toHaveBeenCalledTimes(1);
    expect(createChannel).toHaveBeenCalledTimes(1);
    expect(sendToQueue).toHaveBeenCalledTimes(2);
  });

  it('opens a new channel after the previous one errors out', async () => {
    const publisher = new RabbitMessagePublisher<{ n: number }>(
      'amqp://localhost',
      'my-queue',
    );

    await publisher.publish({ n: 1 });
    const onError = channelOn.mock.calls.find(
      ([event]) => event === 'error',
    )?.[1] as () => void;
    onError();

    await publisher.publish({ n: 2 });

    expect(createChannel).toHaveBeenCalledTimes(2);
  });

  it('opens a new channel after the previous one closes', async () => {
    const publisher = new RabbitMessagePublisher<{ n: number }>(
      'amqp://localhost',
      'my-queue',
    );

    await publisher.publish({ n: 1 });
    const onClose = channelOn.mock.calls.find(
      ([event]) => event === 'close',
    )?.[1] as () => void;
    onClose();

    await publisher.publish({ n: 2 });

    expect(createChannel).toHaveBeenCalledTimes(2);
  });
});
