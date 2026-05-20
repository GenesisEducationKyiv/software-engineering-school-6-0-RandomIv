import type {
  RepositoryEntity,
  SubscriptionEntity,
} from '../../../../src/common/entities';
import { ConflictError, NotFoundError } from '../../../../src/common/errors';
import { SubscriptionApplicationService } from '../../../../src/modules/subscription/subscription.service';
import type { SubscriptionRepository } from '../../../../src/modules/subscription/subscription.repository';
import { AppUrls } from '../../../../src/common/utils/url-builder.util';
import type { RepositoryProvider } from '../../../../src/integrations/github/github.service';
import type { RepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import type { EmailService } from '../../../../src/integrations/email/email.service';
import { Prisma } from '../../../../src/generated/prisma/client';

const repositoryRecord: RepositoryEntity = {
  id: 'repo-1',
  fullName: 'owner/repo',
  lastSeenTag: null,
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const subscriptionRecord: SubscriptionEntity = {
  id: 'sub-1',
  email: 'test@example.com',
  confirmed: false,
  confirmationToken: 'c2796e61-f3d6-4622-87ce-0c203ec83c2d',
  unsubscribeToken: '443a8624-98d3-4d8b-b2a4-4d02e86d58ab',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  repositoryId: 'repo-1',
};

describe('subscription.service', () => {
  const subscriptionRepository: jest.Mocked<SubscriptionRepository> = {
    createSubscription: jest.fn(),
    findByConfirmationToken: jest.fn(),
    updateConfirmation: jest.fn(),
    deleteByUnsubscribeToken: jest.fn(),
    findByEmail: jest.fn(),
  };

  const repositoryProvider: jest.Mocked<RepositoryProvider> = {
    checkRepoExists: jest.fn(),
  };

  const repositoryRepository: jest.Mocked<RepositoryRepository> = {
    getOrCreateRepository: jest.fn(),
    getActiveRepositories: jest.fn(),
    updateLastSeenTag: jest.fn(),
  };

  const emailService: jest.Mocked<EmailService> = {
    sendSubscriptionConfirmationEmail: jest.fn(),
    sendReleaseEmail: jest.fn(),
  };

  const appBaseUrl = 'https://app.example.com';

  const service = new SubscriptionApplicationService({
    subscriptionRepository,
    repositoryProvider,
    repositoryRepository,
    emailService,
    appBaseUrl,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('creates subscription and sends confirmation email', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);

      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );

      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );

      emailService.sendSubscriptionConfirmationEmail.mockResolvedValue(
        {} as never,
      );

      const result = await service.subscribe({
        email: 'test@example.com',
        repo: 'owner/repo',
      });

      expect(result).toEqual(subscriptionRecord);

      expect(repositoryProvider.checkRepoExists).toHaveBeenCalledWith(
        'owner/repo',
      );

      expect(repositoryRepository.getOrCreateRepository).toHaveBeenCalledWith(
        'owner/repo',
      );

      expect(subscriptionRepository.createSubscription).toHaveBeenCalledWith({
        email: 'test@example.com',
        confirmed: false,
        repositoryId: repositoryRecord.id,
      });

      expect(
        emailService.sendSubscriptionConfirmationEmail,
      ).toHaveBeenCalledWith(
        'test@example.com',
        'owner/repo',
        AppUrls.confirm(appBaseUrl, subscriptionRecord.confirmationToken),
        AppUrls.unsubscribe(appBaseUrl, subscriptionRecord.unsubscribeToken),
      );
    });

    it('throws NotFoundError when repository does not exist', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(false);

      await expect(
        service.subscribe({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toThrow(NotFoundError);

      expect(repositoryRepository.getOrCreateRepository).not.toHaveBeenCalled();

      expect(subscriptionRepository.createSubscription).not.toHaveBeenCalled();

      expect(
        emailService.sendSubscriptionConfirmationEmail,
      ).not.toHaveBeenCalled();
    });

    it('propagates ConflictError from repository if email already subscribed', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);

      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );

      subscriptionRepository.createSubscription.mockRejectedValue(
        new ConflictError('Email already subscribed to this repository'),
      );

      const createPromise = service.subscribe({
        email: 'test@example.com',
        repo: 'owner/repo',
      });

      await expect(createPromise).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email already subscribed to this repository',
      });

      await expect(createPromise).rejects.toBeInstanceOf(ConflictError);
    });

    it('propagates confirmation email errors', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);

      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );

      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );

      const emailError = new Error('SMTP down');

      emailService.sendSubscriptionConfirmationEmail.mockRejectedValue(
        emailError,
      );

      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(1);

      await expect(
        service.subscribe({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toThrow(emailError);

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
        service.subscribe({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      await expect(
        service.subscribe({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.not.toBeInstanceOf(ConflictError);
    });
  });

  describe('confirmSubscription', () => {
    it('confirms an existing subscription', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue(
        subscriptionRecord,
      );

      await service.confirmSubscription({
        token: subscriptionRecord.confirmationToken,
      });

      expect(
        subscriptionRepository.findByConfirmationToken,
      ).toHaveBeenCalledWith(subscriptionRecord.confirmationToken);

      expect(subscriptionRepository.updateConfirmation).toHaveBeenCalledWith(
        subscriptionRecord.id,
      );
    });

    it('throws when subscription is already confirmed', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue({
        ...subscriptionRecord,
        confirmed: true,
      });

      await expect(
        service.confirmSubscription({
          token: subscriptionRecord.confirmationToken,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Token already used',
      });

      expect(subscriptionRepository.updateConfirmation).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when token does not exist', async () => {
      subscriptionRepository.findByConfirmationToken.mockResolvedValue(null);

      await expect(
        service.confirmSubscription({
          token: '5bb56998-4e54-4fd2-b76c-c603fbcbf419',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('unsubscribeByToken', () => {
    it('deletes subscription by token', async () => {
      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(1);

      await service.unsubscribeByToken({
        token: subscriptionRecord.unsubscribeToken,
      });

      expect(
        subscriptionRepository.deleteByUnsubscribeToken,
      ).toHaveBeenCalledWith(subscriptionRecord.unsubscribeToken);
    });

    it('throws NotFoundError when token does not exist', async () => {
      subscriptionRepository.deleteByUnsubscribeToken.mockResolvedValue(0);

      await expect(
        service.unsubscribeByToken({
          token: '4cc7f1e2-afaf-4d62-b25c-3ca4e6e3cf90',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('returns only active subscriptions for email', async () => {
      subscriptionRepository.findByEmail.mockResolvedValue([
        {
          ...subscriptionRecord,
          confirmed: true,
          repository: repositoryRecord,
        },
      ]);

      const result = await service.getSubscriptionsByEmail({
        email: 'test@example.com',
      });

      expect(subscriptionRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
        true,
      );

      expect(result).toEqual([
        {
          ...subscriptionRecord,
          email: 'test@example.com',
          confirmed: true,
          repository: repositoryRecord,
        },
      ]);
    });
  });
});
