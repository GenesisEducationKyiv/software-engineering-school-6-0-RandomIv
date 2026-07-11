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

  it('connects, asserts the queue durable, and publishes with persistent:true and a messageId', async () => {
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
      {
        persistent: true,
        messageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    );
  });

  it('asserts the dead-letter topology when deadLetter is enabled', async () => {
    const assertExchange = jest.fn().mockResolvedValue(undefined);
    const bindQueue = jest.fn().mockResolvedValue(undefined);
    createChannel.mockResolvedValueOnce({
      assertQueue,
      assertExchange,
      bindQueue,
      sendToQueue,
      on: channelOn,
    });

    const publisher = new RabbitMessagePublisher<{ hello: string }>(
      'amqp://localhost',
      'my-queue',
      { deadLetter: true },
    );

    await publisher.publish({ hello: 'world' });

    expect(assertExchange).toHaveBeenCalledWith('my-queue.dlx', 'fanout', {
      durable: true,
    });
    expect(assertQueue).toHaveBeenCalledWith('my-queue.dlq', {
      durable: true,
    });
    expect(bindQueue).toHaveBeenCalledWith('my-queue.dlq', 'my-queue.dlx', '');
    expect(assertQueue).toHaveBeenCalledWith('my-queue', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'my-queue.dlx' },
    });
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
