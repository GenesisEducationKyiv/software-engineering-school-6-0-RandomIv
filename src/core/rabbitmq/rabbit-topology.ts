import type amqp from 'amqplib';

export interface DeadLetterTopology {
  queue: string;
  dlxExchange: string;
  dlq: string;
}

export const deadLetterTopologyFor = (queue: string): DeadLetterTopology => ({
  queue,
  dlxExchange: `${queue}.dlx`,
  dlq: `${queue}.dlq`,
});

export const assertDeadLetterQueue = async (
  channel: amqp.Channel,
  topology: DeadLetterTopology,
): Promise<void> => {
  await channel.assertExchange(topology.dlxExchange, 'fanout', {
    durable: true,
  });
  await channel.assertQueue(topology.dlq, { durable: true });
  await channel.bindQueue(topology.dlq, topology.dlxExchange, '');
  await channel.assertQueue(topology.queue, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': topology.dlxExchange },
  });
};
