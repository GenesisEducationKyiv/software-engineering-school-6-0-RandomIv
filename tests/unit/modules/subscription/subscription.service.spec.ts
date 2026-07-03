import type { RepositoryEntity } from '../../../../src/modules/repository/entities/repository.entity';
import type { SubscriptionEntity } from '../../../../src/modules/subscription/entities/subscription.entity';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../../../src/common/errors';
import { SubscriptionService } from '../../../../src/modules/subscription/subscription.service';
import type { SubscriptionRepositoryInterface } from '../../../../src/modules/subscription/interfaces/subscription-repository.interface';
import type { RepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import type { SubscriptionSaga } from '../../../../src/modules/subscription/saga/subscription-saga.interface';
import { Prisma } from '../../../../src/generated/prisma/client';
import type { RepositoryProvider } from '../../../../src/modules/subscription/interfaces/repository-provider.interface';
import { SubscriptionNotificationError } from '../../../../src/modules/subscription/subscription.error';
import { AppUrls } from '../../../../src/common/utils/url-builder.util';
import type { SubscriptionWithRepositoryEntity } from '../../../../src/modules/subscription/entities/subscription-with-repository.entity';

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
  let subscriptionSaga: jest.Mocked<SubscriptionSaga>;
  let service: SubscriptionService;
  const appBaseUrl = 'https://app.example.com';

  beforeEach(() => {
    subscriptionRepository = {
      createSubscription: jest.fn(),
      findByConfirmationToken: jest.fn(),
      confirmByToken: jest.fn(),
      deleteByUnsubscribeToken: jest.fn(),
      deleteById: jest.fn(),
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

    subscriptionSaga = {
      start: jest.fn(),
    };

    service = new SubscriptionService(
      subscriptionRepository,
      repositoryProvider,
      repositoryRepository,
      subscriptionSaga,
      appBaseUrl,
    );
  });

  describe('subscribe', () => {
    it('should successfully create a subscription and start the confirmation saga', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );
      subscriptionSaga.start.mockResolvedValue();

      const result = await service.subscribe({
        email: 'test@example.com',
        repo: 'owner/repo',
      });

      expect(result).toEqual(subscriptionRecord);
      expect(repositoryProvider.checkRepoExists).toHaveBeenCalledWith(
        'owner/repo',
      );
      expect(subscriptionSaga.start).toHaveBeenCalledWith({
        subscriptionId: subscriptionRecord.id,
        email: 'test@example.com',
        repo: 'owner/repo',
        confirmationUrl: AppUrls.confirm(
          appBaseUrl,
          subscriptionRecord.confirmationToken,
        ),
        unsubscribeUrl: AppUrls.unsubscribe(
          appBaseUrl,
          subscriptionRecord.unsubscribeToken,
        ),
      });
    });

    it('should throw NotFoundError if repository does not exist', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(false);

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'invalid/repo' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should roll back and throw SubscriptionNotificationError if starting the saga fails', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );
      subscriptionSaga.start.mockRejectedValue(
        new Error('RabbitMQ unreachable'),
      );
      subscriptionRepository.deleteById.mockResolvedValue(1);

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'owner/repo' }),
      ).rejects.toBeInstanceOf(SubscriptionNotificationError);

      expect(subscriptionRepository.deleteById).toHaveBeenCalledWith(
        subscriptionRecord.id,
      );
    });

    it('propagates ConflictError from repository', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockRejectedValue(
        new ConflictError('Email already subscribed to this repository'),
      );

      await expect(
        service.subscribe({ email: 'test@example.com', repo: 'owner/repo' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('re-throws non-P2002 Prisma errors without mapping to ConflictError', async () => {
      repositoryProvider.checkRepoExists.mockResolvedValue(true);
      repositoryRepository.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' },
      );
      subscriptionRepository.createSubscription.mockRejectedValue(prismaError);

      const error = await service
        .subscribe({ email: 'test@example.com', repo: 'owner/repo' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('confirmSubscription', () => {
    it('should successfully confirm subscription', async () => {
      subscriptionRepository.confirmByToken.mockResolvedValue(1);

      await service.confirmSubscription({ token: 'confirm-token' });

      expect(subscriptionRepository.confirmByToken).toHaveBeenCalledWith(
        'confirm-token',
      );
      expect(
        subscriptionRepository.findByConfirmationToken,
      ).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError if token is invalid', async () => {
      subscriptionRepository.confirmByToken.mockResolvedValue(0);
      subscriptionRepository.findByConfirmationToken.mockResolvedValue(null);

      await expect(
        service.confirmSubscription({ token: 'invalid-token' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('should throw BadRequestError if token was already used', async () => {
      subscriptionRepository.confirmByToken.mockResolvedValue(0);
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

  describe('getSubscriptionsByEmail', () => {
    it('returns confirmed subscriptions with repository', async () => {
      const subscription: SubscriptionWithRepositoryEntity = {
        ...subscriptionRecord,
        confirmed: true,
        repository: repositoryRecord,
      };
      subscriptionRepository.findByEmail.mockResolvedValue([subscription]);

      await expect(
        service.getSubscriptionsByEmail({ email: 'test@example.com' }),
      ).resolves.toEqual([subscription]);

      expect(subscriptionRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com',
        true,
      );
    });
  });
});
