import {
  Prisma,
  type Repository,
  type Subscription,
} from '../../../../src/generated/prisma/client';
import { ConflictError, NotFoundError } from '../../../../src/common/errors';
import { SubscriptionApplicationService } from '../../../../src/modules/subscription/subscription.service';
import type { SubscriptionRepository } from '../../../../src/modules/subscription/subscription.repository';

const repositoryRecord: Repository = {
  id: 'repo-1',
  fullName: 'owner/repo',
  lastSeenTag: null,
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

const subscriptionRecord: Subscription = {
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

  const githubService = {
    checkRepoExists: jest.fn(),
  };
  const repositoryService = {
    getOrCreateRepository: jest.fn(),
  };
  const emailService = {
    sendSubscriptionConfirmationEmail: jest.fn(),
  };

  const service = new SubscriptionApplicationService({
    subscriptionRepository,
    githubService,
    repositoryService,
    emailService,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('creates subscription and sends confirmation email', async () => {
      githubService.checkRepoExists.mockResolvedValue(true);
      repositoryService.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockResolvedValue(
        subscriptionRecord,
      );
      emailService.sendSubscriptionConfirmationEmail.mockResolvedValue(
        {} as never,
      );

      const result = await service.createSubscription({
        email: 'test@example.com',
        repo: 'owner/repo',
      });

      expect(result).toEqual(subscriptionRecord);
      expect(githubService.checkRepoExists).toHaveBeenCalledWith('owner/repo');
      expect(repositoryService.getOrCreateRepository).toHaveBeenCalledWith(
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
        subscriptionRecord.confirmationToken,
        subscriptionRecord.unsubscribeToken,
      );
    });

    it('throws NotFoundError when repository does not exist', async () => {
      githubService.checkRepoExists.mockResolvedValue(false);

      await expect(
        service.createSubscription({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toThrow(NotFoundError);

      expect(repositoryService.getOrCreateRepository).not.toHaveBeenCalled();
      expect(subscriptionRepository.createSubscription).not.toHaveBeenCalled();
      expect(
        emailService.sendSubscriptionConfirmationEmail,
      ).not.toHaveBeenCalled();
    });

    it('maps Prisma P2002 to ConflictError', async () => {
      githubService.checkRepoExists.mockResolvedValue(true);
      repositoryService.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );
      subscriptionRepository.createSubscription.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`,`repository_id`)',
          {
            code: 'P2002',
            clientVersion: 'test',
          } as never,
        ),
      );

      const createPromise = service.createSubscription({
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
      githubService.checkRepoExists.mockResolvedValue(true);
      repositoryService.getOrCreateRepository.mockResolvedValue(
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
        service.createSubscription({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toThrow(emailError);

      expect(
        subscriptionRepository.deleteByUnsubscribeToken,
      ).toHaveBeenCalledWith(subscriptionRecord.unsubscribeToken);
    });

    it('re-throws non-P2002 Prisma errors without mapping to ConflictError', async () => {
      githubService.checkRepoExists.mockResolvedValue(true);
      repositoryService.getOrCreateRepository.mockResolvedValue(
        repositoryRecord,
      );

      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: 'test' } as never,
      );
      subscriptionRepository.createSubscription.mockRejectedValue(prismaError);

      await expect(
        service.createSubscription({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

      await expect(
        service.createSubscription({
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
