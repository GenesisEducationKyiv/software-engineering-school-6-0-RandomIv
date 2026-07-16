import type { RepositoryEntity } from '../../../../src/modules/repository/entities/repository.entity';
import type { SubscriptionEntity } from '../../../../src/modules/subscription/entities/subscription.entity';
import { BadRequestError, NotFoundError } from '../../../../src/common/errors';
import { SubscriptionService } from '../../../../src/modules/subscription/subscription.service';
import type { SubscriptionRepositoryInterface } from '../../../../src/modules/subscription/interfaces/subscription-repository.interface';
import type { RepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import type { EmailService } from '../../../../src/integrations/email/email.service';
import type { RepositoryProvider } from '../../../../src/modules/subscription/interfaces/repository-provider.interface';
import { SubscriptionNotificationError } from '../../../../src/modules/subscription/subscription.error';

const repositoryRecord: RepositoryEntity = {
  id: 'repo-1',
  fullName: 'owner/repo',
  lastSeenTag: 'v1.0.0',
  updatedAt: new Date(),
};

const subscriptionRecord: SubscriptionEntity = {
  id: 'sub-1',
  email: 'test@example.com',
  confirmed: false,
  confirmationToken: 'confirm-token',
  unsubscribeToken: 'unsub-token',
  repositoryId: 'repo-1',
  createdAt: new Date(),
};

describe('subscription.service', () => {
  let subscriptionRepository: jest.Mocked<SubscriptionRepositoryInterface>;
  let repositoryProvider: jest.Mocked<RepositoryProvider>;
  let repositoryRepository: jest.Mocked<RepositoryRepository>;
  let emailService: jest.Mocked<EmailService>;
  let service: SubscriptionService;
  const appBaseUrl = 'https://app.example.com';

  beforeEach(() => {
    subscriptionRepository = {
      createSubscription: jest.fn(),
      findByConfirmationToken: jest.fn(),
      updateConfirmation: jest.fn(),
      deleteByUnsubscribeToken: jest.fn(),
      findByEmail: jest.fn(),
    };

    repositoryProvider = {
      checkRepoExists: jest.fn(),
    };

    repositoryRepository = {
      getOrCreateRepository: jest.fn(),
      getActiveRepositories: jest.fn(),
      updateLastSeenTag: jest.fn(),
    };

    emailService = {
      sendSubscriptionConfirmationEmail: jest.fn(),
      sendReleaseEmail: jest.fn(),
    };

    service = new SubscriptionService(
      subscriptionRepository,
      repositoryProvider,
      repositoryRepository,
      emailService,
      appBaseUrl,
    );
  });

  describe('subscribe', () => {
    it('should throw NotFoundError if repository does not exist', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(false);

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'invalid/repo' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should roll back and throw SubscriptionNotificationError if email sending fails', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );
      emailService.sendSubscriptionConfirmationEmail.mockRejectedValue(
        new Error('SMTP error'),
      );
      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(1);

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'owner/repo' }),
      ).rejects.toBeInstanceOf(SubscriptionNotificationError);

      expect(
        subscriptionRepository.deleteByUnsubscribeToken,
      ).toHaveBeenCalledWith(subscriptionRecord.unsubscribeToken);
    });
  });

  describe('confirmSubscription', () => {
    it('should throw NotFoundError if token is invalid', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue(null);

      await expect(
        service.confirmSubscription({ token: 'invalid-token' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should throw BadRequestError if token was already used', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue({
        ...subscriptionRecord,
        confirmed: true,
      });

      await expect(
        service.confirmSubscription({ token: 'confirm-token' }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });

  describe('unsubscribeByToken', () => {
    it('should throw NotFoundError if unsubscribe token does not match any record', async () => {
      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(0);

      await expect(
        service.unsubscribeByToken({ token: 'invalid-token' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
