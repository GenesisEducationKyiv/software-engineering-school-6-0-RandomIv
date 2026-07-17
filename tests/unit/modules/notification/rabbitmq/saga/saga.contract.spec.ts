import {
  sendConfirmationCommandSchema,
  subscriptionNotificationEventSchema,
} from '../../../../../../src/modules/notification/rabbitmq/saga/saga.contract';

describe('saga.contract schemas', () => {
  describe('sendConfirmationCommandSchema', () => {
    const validCommand = {
      subscriptionId: 'sub-1',
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    it('accepts a valid command', () => {
      expect(sendConfirmationCommandSchema.parse(validCommand)).toEqual(
        validCommand,
      );
    });

    it('rejects a command with a missing subscriptionId', () => {
      const withoutId = {
        to: validCommand.to,
        repo: validCommand.repo,
        confirmationUrl: validCommand.confirmationUrl,
        unsubscribeUrl: validCommand.unsubscribeUrl,
      };
      expect(() => sendConfirmationCommandSchema.parse(withoutId)).toThrow();
    });

    it('rejects a command with a malformed email', () => {
      expect(() =>
        sendConfirmationCommandSchema.parse({ ...validCommand, to: 'nope' }),
      ).toThrow();
    });
  });

  describe('subscriptionNotificationEventSchema', () => {
    it('accepts a confirmation-sent event', () => {
      const event = { type: 'confirmation-sent', subscriptionId: 'sub-1' };
      expect(subscriptionNotificationEventSchema.parse(event)).toEqual(event);
    });

    it('accepts a confirmation-failed event with a reason', () => {
      const event = {
        type: 'confirmation-failed',
        subscriptionId: 'sub-1',
        reason: 'SMTP down',
      };
      expect(subscriptionNotificationEventSchema.parse(event)).toEqual(event);
    });

    it('rejects an unknown event type', () => {
      expect(() =>
        subscriptionNotificationEventSchema.parse({
          type: 'something-else',
          subscriptionId: 'sub-1',
        }),
      ).toThrow();
    });

    it('rejects a confirmation-failed event without a reason', () => {
      expect(() =>
        subscriptionNotificationEventSchema.parse({
          type: 'confirmation-failed',
          subscriptionId: 'sub-1',
        }),
      ).toThrow();
    });
  });
});
