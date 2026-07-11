import { SendConfirmationCommandHandler } from '../../../../../../src/modules/notification/rabbitmq/saga/saga.handler';
import type { NotificationChannel } from '../../../../../../src/modules/notification/delivery/notification-channel.interface';
import type { MessagePublisher } from '../../../../../../src/common/interfaces/message-publisher.interface';
import type { SubscriptionNotificationEvent } from '../../../../../../src/modules/notification/rabbitmq/saga/saga.contract';

describe('saga.handler', () => {
  let deliveryChannel: jest.Mocked<NotificationChannel>;
  let eventPublisher: jest.Mocked<
    MessagePublisher<SubscriptionNotificationEvent>
  >;
  let handler: SendConfirmationCommandHandler;

  beforeEach(() => {
    deliveryChannel = {
      sendConfirmation: jest.fn().mockResolvedValue(undefined),
      sendRelease: jest.fn().mockResolvedValue(undefined),
    };
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    handler = new SendConfirmationCommandHandler(
      deliveryChannel,
      eventPublisher,
    );
  });

  describe('handle', () => {
    it('sends the confirmation and publishes a confirmation-sent event', async () => {
      await handler.handle({
        subscriptionId: 'sub-1',
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
      expect(eventPublisher.publish).toHaveBeenCalledWith({
        type: 'confirmation-sent',
        subscriptionId: 'sub-1',
      });
    });

    it('does not throw and does not resend when only the confirmation-sent publish fails', async () => {
      eventPublisher.publish.mockRejectedValue(new Error('broker unreachable'));

      await expect(
        handler.handle({
          subscriptionId: 'sub-1',
          to: 'user@example.com',
          repo: 'owner/repo',
          confirmationUrl: 'https://app.example.com/confirm/token',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        }),
      ).resolves.toBeUndefined();

      expect(deliveryChannel.sendConfirmation).toHaveBeenCalledTimes(1);
    });

    it('propagates the delivery error without publishing an event', async () => {
      deliveryChannel.sendConfirmation.mockRejectedValue(
        new Error('SMTP down'),
      );

      await expect(
        handler.handle({
          subscriptionId: 'sub-1',
          to: 'user@example.com',
          repo: 'owner/repo',
          confirmationUrl: 'https://app.example.com/confirm/token',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        }),
      ).rejects.toThrow('SMTP down');

      expect(eventPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('onFailureExhausted', () => {
    it('publishes a confirmation-failed event with the error message', async () => {
      await handler.onFailureExhausted(
        {
          subscriptionId: 'sub-1',
          to: 'user@example.com',
          repo: 'owner/repo',
          confirmationUrl: 'https://app.example.com/confirm/token',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        },
        new Error('SMTP down'),
      );

      expect(eventPublisher.publish).toHaveBeenCalledWith({
        type: 'confirmation-failed',
        subscriptionId: 'sub-1',
        reason: 'SMTP down',
      });
    });

    it('falls back to a generic reason for non-Error rejections', async () => {
      await handler.onFailureExhausted(
        {
          subscriptionId: 'sub-1',
          to: 'user@example.com',
          repo: 'owner/repo',
          confirmationUrl: 'https://app.example.com/confirm/token',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        },
        'not-an-error',
      );

      expect(eventPublisher.publish).toHaveBeenCalledWith({
        type: 'confirmation-failed',
        subscriptionId: 'sub-1',
        reason: 'Unknown error',
      });
    });
  });
});
