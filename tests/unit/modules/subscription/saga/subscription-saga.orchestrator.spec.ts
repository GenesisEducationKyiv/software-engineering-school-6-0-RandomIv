import { SubscriptionSagaOrchestrator } from '../../../../../src/modules/subscription/saga/subscription-saga.orchestrator';
import type { SubscriptionRepositoryInterface } from '../../../../../src/modules/subscription/interfaces/subscription-repository.interface';

describe('subscription-saga.orchestrator', () => {
  let subscriptionRepository: jest.Mocked<SubscriptionRepositoryInterface>;
  let orchestrator: SubscriptionSagaOrchestrator;

  beforeEach(() => {
    subscriptionRepository = {
      createSubscription: jest.fn(),
      findByConfirmationToken: jest.fn(),
      confirmByToken: jest.fn(),
      deleteByUnsubscribeToken: jest.fn(),
      deleteById: jest.fn(),
      findByEmail: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionRepositoryInterface>;

    orchestrator = new SubscriptionSagaOrchestrator(subscriptionRepository);
  });

  it('compensates by deleting the subscription on confirmation-failed', async () => {
    await orchestrator.handle({
      type: 'confirmation-failed',
      subscriptionId: 'sub-1',
      reason: 'SMTP error',
    });

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
