import { NotificationMessageHandler } from '../../../../../src/modules/notification/rabbitmq/rabbitmq.handler';
import type { NotificationChannel } from '../../../../../src/modules/notification/delivery/notification-channel.interface';

describe('rabbitmq.handler', () => {
  let deliveryChannel: jest.Mocked<NotificationChannel>;
  let handler: NotificationMessageHandler;

  beforeEach(() => {
    deliveryChannel = {
      sendConfirmation: jest.fn().mockResolvedValue(undefined),
      sendRelease: jest.fn().mockResolvedValue(undefined),
    };
    handler = new NotificationMessageHandler(deliveryChannel);
  });

  it('routes a confirmation message to sendConfirmation', async () => {
    await handler.handle({
      type: 'confirmation',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });

    expect(deliveryChannel.sendConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );
    expect(deliveryChannel.sendRelease).not.toHaveBeenCalled();
  });

  it('routes a release message to sendRelease', async () => {
    await handler.handle({
      type: 'release',
      to: 'user@example.com',
      repo: 'owner/repo',
      tag: 'v2.0.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });

    expect(deliveryChannel.sendRelease).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );
    expect(deliveryChannel.sendConfirmation).not.toHaveBeenCalled();
  });
});
