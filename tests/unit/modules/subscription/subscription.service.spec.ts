import type { RepositoryEntity } from '../../../../src/modules/repository/entities/repository.entity';
import type { SubscriptionEntity } from '../../../../src/modules/subscription/entities/subscription.entity';
import { ConflictError, NotFoundError } from '../../../../src/common/errors';
import { SubscriptionService } from '../../../../src/modules/subscription/subscription.service';
import type { SubscriptionRepositoryInterface } from '../../../../src/modules/subscription/interfaces/subscription-repository.interface';
import type { RepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import type { EmailService } from '../../../../src/integrations/email/email.service';
import { Prisma } from '../../../../src/generated/prisma/client';
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
    } as unknown as jest.Mocked<SubscriptionRepositoryInterface>;

    repositoryProvider = {
      checkRepoExists: jest.fn(),
    };

    repositoryRepository = {
      getOrCreateRepository: jest.fn(),
      getActiveRepositories: jest.fn(),
      updateLastSeenTag: jest.fn(),
    } as unknown as jest.Mocked<RepositoryRepository>;

    emailService = {
      sendSubscriptionConfirmationEmail: jest.fn(),
      sendReleaseNotificationEmail: jest.fn(),
    } as unknown as jest.Mocked<EmailService>;

    service = new SubscriptionService(
      subscriptionRepository,
      repositoryProvider,
      repositoryRepository,
      emailService,
      appBaseUrl,
    );

    jest.resetAllMocks();
  });

  describe('subscribe', () => {
    it('should successfully create a subscription and send an email', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );
      emailService.sendSubscriptionConfirmationEmail.mockResolvedValue();

      const result = await service.subscribe({
        email: 'test@example.com',
        repo: 'owner/repo',
      });

      expect(result).toEqual(subscriptionRecord);
      expect(repositoryProvider.checkRepoExists).toHaveBeenCalledWith(
        'owner/repo',
      );
      expect(emailService.sendSubscriptionConfirmationEmail).toHaveBeenCalled();
    });

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

    it('re-throws non-P2002 Prisma errors without mapping to ConflictError', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' } as never,
      );
      subscriptionRepository.createSubscription.mockRejectedValue(prismaError);

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'owner/repo' }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'owner/repo' }),
      ).rejects.not.toBeInstanceOf(ConflictError);
    });
  });

  describe('confirmSubscription', () => {
    it('should successfully confirm subscription', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue(
        subscriptionRecord,
      );
      subscriptionRepository.updateConfirmation.mockResolvedValue();

      await service.confirmSubscription({ token: 'confirm-token' });

      expect(
        subscriptionRepository.findByConfirmationToken,
      ).toHaveBeenCalledWith('confirm-token');
      expect(subscriptionRepository.updateConfirmation).toHaveBeenCalledWith(
        subscriptionRecord.id,
      );
    });

    it('should throw NotFoundError if token is invalid', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue(null);

      await expect(
        service.confirmSubscription({ token: 'invalid-token' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('unsubscribeByToken', () => {
    it('should successfully delete subscription by unsubscribe token', async () => {
      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(1);

      await service.unsubscribeByToken({ token: 'unsub-token' });

      expect(
        subscriptionRepository.deleteByUnsubscribeToken,
      ).toHaveBeenCalledWith('unsub-token');
    });

    it('should throw NotFoundError if unsubscribe token does not match any record', async () => {
      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(0);

      await expect(
        service.unsubscribeByToken({ token: 'invalid-token' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
