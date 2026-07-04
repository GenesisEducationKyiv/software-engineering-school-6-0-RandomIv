import { RabbitMqProvider } from '../../../../../src/modules/notification/rabbitmq/rabbitmq.provider';
import type { MessagePublisher } from '../../../../../src/common/interfaces/message-publisher.interface';
import type { NotificationMessage } from '../../../../../src/modules/notification/rabbitmq/rabbitmq.contract';

describe('rabbitmq.provider', () => {
  let publisher: jest.Mocked<MessagePublisher<NotificationMessage>>;
  let provider: RabbitMqProvider;

  beforeEach(() => {
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    provider = new RabbitMqProvider(publisher);
  });

  it('publishes a confirmation message ignoring subscriptionId', async () => {
    await provider.sendConfirmation(
      'sub-1',
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    expect(publisher.publish).toHaveBeenCalledWith({
      type: 'confirmation',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });
  });

  it('publishes a release message', async () => {
    await provider.sendRelease(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );

    expect(publisher.publish).toHaveBeenCalledWith({
      type: 'release',
      to: 'user@example.com',
      repo: 'owner/repo',
      tag: 'v2.0.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });
  });
});
