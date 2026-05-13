import {
  Prisma,
  type Repository,
  type Subscription,
} from '../../../../src/generated/prisma/client';
import { ConflictError, NotFoundError } from '../../../../src/common/errors';
import { prismaMock } from '../../../mocks/prisma.mock';

jest.mock('../../../../src/modules/github/github.service', () => ({
  checkRepoExists: jest.fn(),
}));

jest.mock('../../../../src/modules/repository/repository.service', () => ({
  getOrCreateRepository: jest.fn(),
}));

jest.mock('../../../../src/modules/notification/email.service', () => ({
  sendSubscriptionConfirmationEmail: jest.fn(),
}));

import { checkRepoExists } from '../../../../src/modules/github/github.service';
import { getOrCreateRepository } from '../../../../src/modules/repository/repository.service';
import { sendSubscriptionConfirmationEmail } from '../../../../src/modules/notification/email.service';
import {
  confirmSubscription,
  createSubscription,
  getSubscriptionsByEmail,
  unsubscribeByToken,
} from '../../../../src/modules/subscription/subscription.service';

const mockedCheckRepoExists = jest.mocked(checkRepoExists);
const mockedGetOrCreateRepository = jest.mocked(getOrCreateRepository);
const mockedSendSubscriptionConfirmationEmail = jest.mocked(
  sendSubscriptionConfirmationEmail,
);

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('creates subscription and sends confirmation email', async () => {
      mockedCheckRepoExists.mockResolvedValue(true);
      mockedGetOrCreateRepository.mockResolvedValue(repositoryRecord);
      prismaMock.subscription.create.mockResolvedValue(subscriptionRecord);
      mockedSendSubscriptionConfirmationEmail.mockResolvedValue({} as never);

      const result = await createSubscription({
        email: 'test@example.com',
        repo: 'owner/repo',
      });

      expect(result).toEqual(subscriptionRecord);
      expect(mockedCheckRepoExists).toHaveBeenCalledWith('owner/repo');
      expect(mockedGetOrCreateRepository).toHaveBeenCalledWith('owner/repo');
      expect(prismaMock.subscription.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          confirmed: false,
          repositoryId: repositoryRecord.id,
        },
      });
      expect(mockedSendSubscriptionConfirmationEmail).toHaveBeenCalledWith(
        'test@example.com',
        'owner/repo',
        subscriptionRecord.confirmationToken,
        subscriptionRecord.unsubscribeToken,
      );
    });

    it('throws NotFoundError when repository does not exist', async () => {
      mockedCheckRepoExists.mockResolvedValue(false);

      await expect(
        createSubscription({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toThrow(NotFoundError);

      expect(mockedGetOrCreateRepository).not.toHaveBeenCalled();
      expect(prismaMock.subscription.create).not.toHaveBeenCalled();
      expect(mockedSendSubscriptionConfirmationEmail).not.toHaveBeenCalled();
    });

    it('maps Prisma P2002 to ConflictError', async () => {
      mockedCheckRepoExists.mockResolvedValue(true);
      mockedGetOrCreateRepository.mockResolvedValue(repositoryRecord);
      prismaMock.subscription.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`,`repository_id`)',
          {
            code: 'P2002',
            clientVersion: 'test',
          } as never,
        ),
      );

      const createPromise = createSubscription({
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
      mockedCheckRepoExists.mockResolvedValue(true);
      mockedGetOrCreateRepository.mockResolvedValue(repositoryRecord);
      prismaMock.subscription.create.mockResolvedValue(subscriptionRecord);
      const emailError = new Error('SMTP down');
      mockedSendSubscriptionConfirmationEmail.mockRejectedValue(emailError);

      await expect(
        createSubscription({
          email: 'test@example.com',
          repo: 'owner/repo',
        }),
      ).rejects.toThrow(emailError);

      expect(prismaMock.subscription.deleteMany).toHaveBeenCalledWith({
        where: { id: subscriptionRecord.id },
      });
    });
  });

  describe('confirmSubscription', () => {
    it('confirms an existing subscription', async () => {
      prismaMock.subscription.findUnique.mockResolvedValue(subscriptionRecord);

      await confirmSubscription({
        token: subscriptionRecord.confirmationToken,
      });

      expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({
        where: { confirmationToken: subscriptionRecord.confirmationToken },
      });
      expect(prismaMock.subscription.update).toHaveBeenCalledWith({
        where: { id: subscriptionRecord.id },
        data: { confirmed: true },
      });
    });

    it('throws when subscription is already confirmed', async () => {
      prismaMock.subscription.findUnique.mockResolvedValue({
        ...subscriptionRecord,
        confirmed: true,
      });

      await expect(
        confirmSubscription({
          token: subscriptionRecord.confirmationToken,
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Token already used',
      });

      expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when token does not exist', async () => {
      prismaMock.subscription.findUnique.mockResolvedValue(null);

      await expect(
        confirmSubscription({
          token: '5bb56998-4e54-4fd2-b76c-c603fbcbf419',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('unsubscribeByToken', () => {
    it('deletes subscription by token', async () => {
      prismaMock.subscription.deleteMany.mockResolvedValue({ count: 1 });

      await unsubscribeByToken({
        token: subscriptionRecord.unsubscribeToken,
      });

      expect(prismaMock.subscription.deleteMany).toHaveBeenCalledWith({
        where: { unsubscribeToken: subscriptionRecord.unsubscribeToken },
      });
    });

    it('throws NotFoundError when token does not exist', async () => {
      prismaMock.subscription.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        unsubscribeByToken({
          token: '4cc7f1e2-afaf-4d62-b25c-3ca4e6e3cf90',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getSubscriptionsByEmail', () => {
    it('returns only active subscriptions for email', async () => {
      prismaMock.subscription.findMany.mockResolvedValue([
        {
          ...subscriptionRecord,
          confirmed: true,
          repository: repositoryRecord,
        },
      ] as never);

      const result = await getSubscriptionsByEmail({
        email: 'test@example.com',
      });

      expect(prismaMock.subscription.findMany).toHaveBeenCalledWith({
        where: {
          email: 'test@example.com',
          confirmed: true,
        },
        include: {
          repository: true,
        },
      });
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
