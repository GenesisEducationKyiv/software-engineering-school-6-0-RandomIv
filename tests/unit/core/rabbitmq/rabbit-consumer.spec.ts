import amqp from 'amqplib';
import { RabbitConsumer } from '../../../../src/core/rabbitmq/rabbit-consumer';
import type { MessageHandler } from '../../../../src/common/interfaces/message-handler.interface';

jest.mock('amqplib');

interface Payload {
  value: string;
}

const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('rabbit-consumer', () => {
  const ack = jest.fn();
  const nack = jest.fn();
  const prefetch = jest.fn();
  const assertQueue = jest.fn();
  const assertExchange = jest.fn();
  const bindQueue = jest.fn();
  const consume = jest.fn();
  const createChannel = jest.fn();
  const modelOn = jest.fn();

  const channel = {
    assertQueue,
    assertExchange,
    bindQueue,
    prefetch,
    consume,
    ack,
    nack,
  };
  const model = { createChannel, on: modelOn };

  let handler: jest.Mocked<MessageHandler<Payload>>;
  let consumer: RabbitConsumer<Payload>;

  const message = (
    payload: unknown,
    redelivered = false,
    messageId?: string,
  ) => ({
    content: Buffer.from(JSON.stringify(payload)),
    fields: { redelivered },
    properties: { messageId },
  });

  const getConsumeCallback = (callIndex = consume.mock.calls.length - 1) =>
    consume.mock.calls[callIndex]![1] as (
      msg: ReturnType<typeof message> | null,
    ) => void;

  beforeEach(async () => {
    assertQueue.mockResolvedValue(undefined);
    assertExchange.mockResolvedValue(undefined);
    bindQueue.mockResolvedValue(undefined);
    prefetch.mockResolvedValue(undefined);
    consume.mockResolvedValue(undefined);
    createChannel.mockResolvedValue(channel);
    (amqp.connect as jest.Mock).mockResolvedValue(model);

    handler = { handle: jest.fn(), onFailureExhausted: jest.fn() };
    consumer = new RabbitConsumer('amqp://localhost', 'my-queue', handler);
    await consumer.start();
  });

  it('asserts the queue durable and sets prefetch(1)', () => {
    expect(assertQueue).toHaveBeenCalledWith('my-queue', { durable: true });
    expect(prefetch).toHaveBeenCalledWith(1);
  });

  it('acks after the handler processes the message successfully', async () => {
    handler.handle.mockResolvedValue(undefined);

    getConsumeCallback()(message({ value: 'ok' }));
    await flushPromises();

    expect(handler.handle).toHaveBeenCalledWith({ value: 'ok' });
    expect(ack).toHaveBeenCalled();
  });

  it('requeues malformed JSON on first delivery without invoking the handler', async () => {
    const malformed = {
      content: Buffer.from('not-json'),
      fields: { redelivered: false },
    };

    getConsumeCallback()(malformed as never);
    await flushPromises();

    expect(handler.handle).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(malformed, false, true);
  });

  it('drops malformed JSON without requeueing once already redelivered', async () => {
    const malformed = {
      content: Buffer.from('not-json'),
      fields: { redelivered: true },
    };

    getConsumeCallback()(malformed as never);
    await flushPromises();

    expect(handler.handle).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(malformed, false, false);
  });

  it('requeues once when the handler fails on first delivery', async () => {
    handler.handle.mockRejectedValue(new Error('boom'));

    const msg = message({ value: 'retry-me' });
    getConsumeCallback()(msg);
    await flushPromises();

    expect(nack).toHaveBeenCalledWith(msg, false, true);
    expect(handler.onFailureExhausted).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });

  it('calls onFailureExhausted and acks after the handler fails on a redelivered message', async () => {
    const error = new Error('boom');
    handler.handle.mockRejectedValue(error);

    const msg = message({ value: 'poison' }, true);
    getConsumeCallback()(msg);
    await flushPromises();

    expect(handler.onFailureExhausted).toHaveBeenCalledWith(
      { value: 'poison' },
      error,
    );
    expect(ack).toHaveBeenCalledWith(msg);
  });

  it('ignores a null message', async () => {
    getConsumeCallback()(null);
    await flushPromises();

    expect(handler.handle).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });

  it('re-establishes the channel when the connection recovers', async () => {
    createChannel.mockClear();
    const onConnect = modelOn.mock.calls.find(
      ([event]) => event === 'connect',
    )?.[1] as (reconnectedModel: unknown) => Promise<void>;

    await onConnect(model);

    expect(createChannel).toHaveBeenCalledTimes(1);
  });

  it('skips a duplicate message by messageId without invoking the handler again', async () => {
    handler.handle.mockResolvedValue(undefined);

    getConsumeCallback()(message({ value: 'ok' }, false, 'msg-1'));
    await flushPromises();
    getConsumeCallback()(message({ value: 'ok' }, true, 'msg-1'));
    await flushPromises();

    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(2);
    expect(nack).not.toHaveBeenCalled();
  });

  it('parses the raw message with a custom parseMessage before handling', async () => {
    const parseMessage = jest.fn((raw: unknown) => raw as Payload);
    const parsingHandler: jest.Mocked<MessageHandler<Payload>> = {
      handle: jest.fn().mockResolvedValue(undefined),
      onFailureExhausted: jest.fn(),
    };
    const parsingConsumer = new RabbitConsumer(
      'amqp://localhost',
      'my-queue',
      parsingHandler,
      { parseMessage },
    );
    await parsingConsumer.start();

    getConsumeCallback()(message({ value: 'ok' }));
    await flushPromises();

    expect(parseMessage).toHaveBeenCalledWith({ value: 'ok' });
    expect(parsingHandler.handle).toHaveBeenCalledWith({ value: 'ok' });
  });

  it('requeues once when parseMessage throws on first delivery', async () => {
    const parseMessage = jest.fn(() => {
      throw new Error('invalid shape');
    });
    const parsingHandler: jest.Mocked<MessageHandler<Payload>> = {
      handle: jest.fn(),
      onFailureExhausted: jest.fn(),
    };
    const parsingConsumer = new RabbitConsumer(
      'amqp://localhost',
      'my-queue',
      parsingHandler,
      { parseMessage },
    );
    await parsingConsumer.start();

    const msg = message({ value: 'bad' });
    getConsumeCallback()(msg);
    await flushPromises();

    expect(parsingHandler.handle).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(msg, false, true);
  });

  describe('with deadLetter enabled', () => {
    let dlqHandler: jest.Mocked<MessageHandler<Payload>>;

    beforeEach(async () => {
      dlqHandler = { handle: jest.fn(), onFailureExhausted: jest.fn() };
      const dlqConsumer = new RabbitConsumer(
        'amqp://localhost',
        'my-queue',
        dlqHandler,
        { deadLetter: true },
      );
      await dlqConsumer.start();
    });

    it('asserts a dead-letter exchange and binds the DLQ before the main queue', () => {
      expect(assertExchange).toHaveBeenCalledWith('my-queue.dlx', 'fanout', {
        durable: true,
      });
      expect(assertQueue).toHaveBeenCalledWith('my-queue.dlq', {
        durable: true,
      });
      expect(bindQueue).toHaveBeenCalledWith(
        'my-queue.dlq',
        'my-queue.dlx',
        '',
      );
      expect(assertQueue).toHaveBeenCalledWith('my-queue', {
        durable: true,
        arguments: { 'x-dead-letter-exchange': 'my-queue.dlx' },
      });
    });

    it('nacks without requeue (routing to the DLQ) once retries are exhausted', async () => {
      const error = new Error('boom');
      dlqHandler.handle.mockRejectedValue(error);

      const msg = message({ value: 'poison' }, true);
      getConsumeCallback()(msg);
      await flushPromises();

      expect(dlqHandler.onFailureExhausted).toHaveBeenCalledWith(
        { value: 'poison' },
        error,
      );
      expect(nack).toHaveBeenCalledWith(msg, false, false);
      expect(ack).not.toHaveBeenCalled();
    });
  });
});
