import { EmailNotificationProvider } from '../../../../../src/modules/notification/delivery/email.provider';
import type { EmailService } from '../../../../../src/integrations/email/email.service';

describe('delivery/email.provider', () => {
  const emailService: jest.Mocked<EmailService> = {
    sendSubscriptionConfirmationEmail: jest.fn().mockResolvedValue(undefined),
    sendReleaseEmail: jest.fn().mockResolvedValue(undefined),
  };

  const provider = new EmailNotificationProvider(emailService);

  it('delegates sendConfirmation to emailService.sendSubscriptionConfirmationEmail', async () => {
    await provider.sendConfirmation(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    expect(emailService.sendSubscriptionConfirmationEmail).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );
    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
  });

  it('delegates sendRelease to emailService.sendReleaseEmail', async () => {
    await provider.sendRelease(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );

    expect(emailService.sendReleaseEmail).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );
    expect(
      emailService.sendSubscriptionConfirmationEmail,
    ).not.toHaveBeenCalled();
  });

  it('propagates error from emailService.sendSubscriptionConfirmationEmail', async () => {
    emailService.sendSubscriptionConfirmationEmail.mockRejectedValueOnce(
      new Error('SMTP error'),
    );

    await expect(
      provider.sendConfirmation(
        'user@example.com',
        'owner/repo',
        'https://app.example.com/confirm/token',
        'https://app.example.com/unsubscribe/token',
      ),
    ).rejects.toThrow('SMTP error');
  });

  it('propagates error from emailService.sendReleaseEmail', async () => {
    emailService.sendReleaseEmail.mockRejectedValueOnce(
      new Error('SMTP error'),
    );

    await expect(
      provider.sendRelease(
        'user@example.com',
        'owner/repo',
        'v2.0.0',
        'https://github.com/owner/repo/releases/tag/v2.0.0',
        'https://app.example.com/unsubscribe/token',
      ),
    ).rejects.toThrow('SMTP error');
  });
});
