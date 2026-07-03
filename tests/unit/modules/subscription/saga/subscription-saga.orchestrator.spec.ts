import amqp from 'amqplib';
import { SubscriptionSagaOrchestrator } from '../../../../../src/modules/subscription/saga/subscription-saga.orchestrator';
import { SEND_CONFIRMATION_COMMAND_QUEUE } from '../../../../../src/modules/subscription/saga/subscription-saga.contract';
import type { SubscriptionRepositoryInterface } from '../../../../../src/modules/subscription/interfaces/subscription-repository.interface';

jest.mock('amqplib');

describe('subscription-saga.orchestrator', () => {
  const sendToQueue = jest.fn();
  const assertQueue = jest.fn().mockResolvedValue(undefined);

  const mqChannel = {
    sendToQueue,
    assertQueue,
    on: jest.fn(),
  };

  const model = {
    createChannel: jest.fn().mockResolvedValue(mqChannel),
    close: jest.fn().mockResolvedValue(undefined),
  };

  let subscriptionRepository: jest.Mocked<SubscriptionRepositoryInterface>;
  let orchestrator: SubscriptionSagaOrchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    (amqp.connect as jest.Mock).mockResolvedValue(model);

    subscriptionRepository = {
      createSubscription: jest.fn(),
      findByConfirmationToken: jest.fn(),
      confirmByToken: jest.fn(),
      deleteByUnsubscribeToken: jest.fn(),
      deleteById: jest.fn(),
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionRepositoryInterface>;

    orchestrator = new SubscriptionSagaOrchestrator(
      'amqp://localhost',
      subscriptionRepository,
    );
  });

  describe('start', () => {
    it('publishes the SendConfirmationEmail command to the durable queue', async () => {
      await orchestrator.start({
        subscriptionId: 'sub-1',
        email: 'user@example.com',
        repo: 'owner/repo',
        confirmationUrl: 'https://app.example.com/confirm/token',
        unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
      });

      expect(assertQueue).toHaveBeenCalledWith(
        SEND_CONFIRMATION_COMMAND_QUEUE,
        { durable: true },
      );
      expect(sendToQueue).toHaveBeenCalledWith(
        SEND_CONFIRMATION_COMMAND_QUEUE,
        Buffer.from(
          JSON.stringify({
            subscriptionId: 'sub-1',
            email: 'user@example.com',
            repo: 'owner/repo',
            confirmationUrl: 'https://app.example.com/confirm/token',
            unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
          }),
        ),
        { persistent: true },
      );
    });
  });

  describe('handleEvent', () => {
    it('compensates by deleting the subscription on confirmation-email-failed', async () => {
      await orchestrator.handleEvent({
        type: 'confirmation-email-failed',
        subscriptionId: 'sub-1',
        reason: 'SMTP error',
      });

      expect(subscriptionRepository.deleteById).toHaveBeenCalledWith('sub-1');
    });

    it('does nothing on confirmation-email-sent', async () => {
      await orchestrator.handleEvent({
        type: 'confirmation-email-sent',
        subscriptionId: 'sub-1',
      });

      expect(subscriptionRepository.deleteById).not.toHaveBeenCalled();
    });
  });
});
