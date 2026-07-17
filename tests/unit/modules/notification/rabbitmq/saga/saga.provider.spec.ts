import { SagaConfirmationProvider } from '../../../../../../src/modules/notification/rabbitmq/saga/saga.provider';
import type { MessagePublisher } from '../../../../../../src/common/interfaces/message-publisher.interface';
import type { SendConfirmationCommand } from '../../../../../../src/modules/notification/rabbitmq/saga/saga.contract';

describe('saga.provider', () => {
  let publisher: jest.Mocked<MessagePublisher<SendConfirmationCommand>>;
  let provider: SagaConfirmationProvider;

  beforeEach(() => {
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    provider = new SagaConfirmationProvider(publisher);
  });

  it('publishes a SendConfirmationCommand correlated by subscriptionId', async () => {
    await provider.sendConfirmation(
      'sub-1',
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    expect(publisher.publish).toHaveBeenCalledWith({
      subscriptionId: 'sub-1',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });
  });
});
