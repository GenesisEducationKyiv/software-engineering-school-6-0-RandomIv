import amqp from 'amqplib';
import { RabbitMessagePublisher } from '../../../../src/core/rabbitmq/rabbit-publisher';

jest.mock('amqplib');

type SendCallback = (err?: unknown) => void;

describe('rabbit-publisher', () => {
  const sendToQueue = jest.fn();
  const assertQueue = jest.fn();
  const channelOn = jest.fn();
  const createConfirmChannel = jest.fn();

  const channel = { assertQueue, sendToQueue, on: channelOn };
  const model = { createConfirmChannel };

  beforeEach(() => {
    assertQueue.mockResolvedValue(undefined);
    sendToQueue.mockImplementation(
      (_queue: string, _content: Buffer, _options, callback?: SendCallback) => {
        callback?.();
        return true;
      },
    );
    createConfirmChannel.mockResolvedValue(channel);
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
      expect.any(Function),
    );
  });

  it('rejects when the broker fails to confirm the message', async () => {
    sendToQueue.mockImplementationOnce(
      (_queue: string, _content: Buffer, _options, callback?: SendCallback) => {
        callback?.(new Error('message nacked by broker'));
        return true;
      },
    );

    const publisher = new RabbitMessagePublisher<{ hello: string }>(
      'amqp://localhost',
      'my-queue',
    );

    await expect(publisher.publish({ hello: 'world' })).rejects.toThrow(
      'message nacked by broker',
    );
  });

  it('asserts the dead-letter topology when deadLetter is enabled', async () => {
    const assertExchange = jest.fn().mockResolvedValue(undefined);
    const bindQueue = jest.fn().mockResolvedValue(undefined);
    createConfirmChannel.mockResolvedValueOnce({
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
    expect(createConfirmChannel).toHaveBeenCalledTimes(1);
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

    expect(createConfirmChannel).toHaveBeenCalledTimes(2);
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

    expect(createConfirmChannel).toHaveBeenCalledTimes(2);
  });
});
