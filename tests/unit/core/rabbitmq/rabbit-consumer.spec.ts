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
  const consume = jest.fn();
  const createChannel = jest.fn();
  const modelOn = jest.fn();

  const channel = { assertQueue, prefetch, consume, ack, nack };
  const model = { createChannel, on: modelOn };

  let handler: jest.Mocked<MessageHandler<Payload>>;
  let consumer: RabbitConsumer<Payload>;

  const message = (payload: unknown, redelivered = false) => ({
    content: Buffer.from(JSON.stringify(payload)),
    fields: { redelivered },
  });

  const getConsumeCallback = () =>
    consume.mock.calls[0]![1] as (
      msg: ReturnType<typeof message> | null,
    ) => void;

  beforeEach(async () => {
    assertQueue.mockResolvedValue(undefined);
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
});
