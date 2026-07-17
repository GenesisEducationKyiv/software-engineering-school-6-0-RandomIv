import { SubscriptionSagaOrchestrator } from '../../../../../src/modules/subscription/saga/subscription-saga.orchestrator';
import type { SubscriptionRepositoryInterface } from '../../../../../src/modules/subscription/interfaces/subscription-repository.interface';
import type { MessagePublisher } from '../../../../../src/common/interfaces/message-publisher.interface';
import type { SendConfirmationCommand } from '../../../../../src/modules/notification/rabbitmq/saga/saga.contract';

describe('subscription-saga.orchestrator', () => {
  let subscriptionRepository: jest.Mocked<SubscriptionRepositoryInterface>;
  let commandPublisher: jest.Mocked<MessagePublisher<SendConfirmationCommand>>;
  let orchestrator: SubscriptionSagaOrchestrator;

  const context = {
    subscriptionId: 'sub-1',
    to: 'test@example.com',
    repo: 'owner/repo',
    confirmationUrl: 'https://app.example.com/confirm/token',
    unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
  };

  beforeEach(() => {
    subscriptionRepository = {
      createSubscription: jest.fn(),
      findByConfirmationToken: jest.fn(),
      confirmByToken: jest.fn(),
      deleteByUnsubscribeToken: jest.fn(),
      deleteById: jest.fn(),
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionRepositoryInterface>;

    commandPublisher = { publish: jest.fn() };

    orchestrator = new SubscriptionSagaOrchestrator(
      commandPublisher,
      subscriptionRepository,
    );
  });

  describe('start', () => {
    it('dispatches the send-confirmation command', async () => {
      commandPublisher.publish.mockResolvedValue();

      await orchestrator.start(context);

      expect(commandPublisher.publish).toHaveBeenCalledWith({
        subscriptionId: 'sub-1',
        to: 'test@example.com',
        repo: 'owner/repo',
        confirmationUrl: context.confirmationUrl,
        unsubscribeUrl: context.unsubscribeUrl,
      });
      expect(subscriptionRepository.deleteById).not.toHaveBeenCalled();
    });

    it('compensates and rethrows when the command dispatch fails', async () => {
      const publishError = new Error('RabbitMQ unreachable');
      commandPublisher.publish.mockRejectedValue(publishError);
      subscriptionRepository.deleteById.mockResolvedValue(1);

      await expect(orchestrator.start(context)).rejects.toBe(publishError);

      expect(subscriptionRepository.deleteById).toHaveBeenCalledWith('sub-1');
    });
  });

  describe('handle', () => {
    it('compensates by deleting the subscription on confirmation-failed', async () => {
      subscriptionRepository.deleteById.mockResolvedValue(1);

      await orchestrator.handle({
        type: 'confirmation-failed',
        subscriptionId: 'sub-1',
        reason: 'SMTP error',
      });

      expect(subscriptionRepository.deleteById).toHaveBeenCalledWith('sub-1');
    });

    it('skips compensation without error when the subscription was already confirmed or removed', async () => {
      subscriptionRepository.deleteById.mockResolvedValue(0);

      await expect(
        orchestrator.handle({
          type: 'confirmation-failed',
          subscriptionId: 'sub-1',
          reason: 'SMTP error',
        }),
      ).resolves.toBeUndefined();

      expect(subscriptionRepository.deleteById).toHaveBeenCalledWith('sub-1');
    });

    it('does nothing on confirmation-sent', async () => {
      await orchestrator.handle({
        type: 'confirmation-sent',
        subscriptionId: 'sub-1',
      });

      expect(subscriptionRepository.deleteById).not.toHaveBeenCalled();
    });
  });
});
