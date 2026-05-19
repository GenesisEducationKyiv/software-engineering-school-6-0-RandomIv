import type { RepositoryWithSubscriptions } from '../../../../src/common/types/repository-with-subscriptions.type';
import type { Subscription } from '../../../../src/generated/prisma/client';
import { RateLimitError } from '../../../../src/common/errors';
import { ReleaseScannerService } from '../../../../src/modules/scanner/scanner.service';
import { AppUrls } from '../../../../src/common/utils/url-builder.util';
import type { RepositoryRepository } from '../../../../src/modules/repository/repository.repository';
import type { ReleaseProvider } from '../../../../src/integrations/github/github.service';
import type { EmailService } from '../../../../src/integrations/email/email.service';

const createSubscription = (id: string, email: string): Subscription => ({
  id,
  email,
  confirmed: true,
  confirmationToken: `${id}-confirm-token`,
  unsubscribeToken: `${id}-unsubscribe-token`,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  repositoryId: 'repo-1',
});

const createRepository = (
  overrides?: Partial<RepositoryWithSubscriptions>,
): RepositoryWithSubscriptions => ({
  id: 'repo-1',
  fullName: 'owner/repo',
  lastSeenTag: null,
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  subscriptions: [createSubscription('sub-1', 'user@example.com')],
  ...overrides,
});

describe('scanner.service', () => {
  const repositoryRepository: jest.Mocked<RepositoryRepository> = {
    getActiveRepositories: jest.fn(),
    updateLastSeenTag: jest.fn(),
    getOrCreateRepository: jest.fn(),
  };
  const releaseProvider: jest.Mocked<ReleaseProvider> = {
    getLatestRelease: jest.fn(),
  };
  const emailService: jest.Mocked<EmailService> = {
    sendSubscriptionConfirmationEmail: jest.fn(),
    sendReleaseEmail: jest.fn(),
  };
  const appBaseUrl = 'https://app.example.com';

  const service = new ReleaseScannerService({
    repositoryRepository,
    releaseProvider,
    emailService,
    appBaseUrl,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when there are no active repositories', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([]);

    await service.checkReleases();

    expect(releaseProvider.getLatestRelease).not.toHaveBeenCalled();
    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('skips repository when latest tag is null', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([
      createRepository(),
    ]);
    releaseProvider.getLatestRelease.mockResolvedValueOnce(null);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('skips repository when latest tag equals lastSeenTag', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([
      createRepository({ lastSeenTag: 'v1.0.0' }),
    ]);
    releaseProvider.getLatestRelease.mockResolvedValueOnce({
      tag: 'v1.0.0',
      url: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    });

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('sends notifications and updates lastSeenTag when all emails succeed', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([
      createRepository({
        subscriptions: [
          createSubscription('sub-1', 'a@example.com'),
          createSubscription('sub-2', 'b@example.com'),
        ],
      }),
    ]);
    releaseProvider.getLatestRelease.mockResolvedValueOnce({
      tag: 'v2.0.0',
      url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
    });
    emailService.sendReleaseEmail.mockResolvedValue({
      messageId: 'ok',
    } as never);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).toHaveBeenCalledTimes(2);
    expect(emailService.sendReleaseEmail).toHaveBeenNthCalledWith(
      1,
      'a@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      AppUrls.unsubscribe(appBaseUrl, 'sub-1-unsubscribe-token'),
    );
    expect(emailService.sendReleaseEmail).toHaveBeenNthCalledWith(
      2,
      'b@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      AppUrls.unsubscribe(appBaseUrl, 'sub-2-unsubscribe-token'),
    );
    expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-1',
      'v2.0.0',
    );
  });

  it('does not update lastSeenTag when at least one email fails', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([
      createRepository({
        subscriptions: [
          createSubscription('sub-1', 'a@example.com'),
          createSubscription('sub-2', 'b@example.com'),
        ],
      }),
    ]);
    releaseProvider.getLatestRelease.mockResolvedValueOnce({
      tag: 'v2.0.0',
      url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
    });
    emailService.sendReleaseEmail
      .mockRejectedValueOnce(new Error('SMTP failed'))
      .mockResolvedValueOnce({ messageId: 'ok' } as never);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).toHaveBeenCalledTimes(2);
    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('continues processing next repositories when one repository fails', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([
      createRepository({ id: 'repo-1', fullName: 'owner/first' }),
      createRepository({ id: 'repo-2', fullName: 'owner/second' }),
    ]);
    releaseProvider.getLatestRelease
      .mockRejectedValueOnce(new Error('GitHub unavailable'))
      .mockResolvedValueOnce({
        tag: 'v3.0.0',
        url: 'https://github.com/owner/second/releases/tag/v3.0.0',
      });
    emailService.sendReleaseEmail.mockResolvedValue({
      messageId: 'ok',
    } as never);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendReleaseEmail).toHaveBeenCalledWith(
      'user@example.com',
      'owner/second',
      'v3.0.0',
      'https://github.com/owner/second/releases/tag/v3.0.0',
      AppUrls.unsubscribe(appBaseUrl, 'sub-1-unsubscribe-token'),
    );
    expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledTimes(1);
    expect(repositoryRepository.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-2',
      'v3.0.0',
    );
  });

  it('stops current scan cycle when GitHub rate limit is reached', async () => {
    repositoryRepository.getActiveRepositories.mockResolvedValue([
      createRepository({ id: 'repo-1', fullName: 'owner/first' }),
      createRepository({ id: 'repo-2', fullName: 'owner/second' }),
    ]);
    releaseProvider.getLatestRelease
      .mockRejectedValueOnce(new RateLimitError())
      .mockResolvedValueOnce({
        tag: 'v3.0.0',
        url: 'https://github.com/owner/second/releases/tag/v3.0.0',
      });

    await service.checkReleases();

    expect(releaseProvider.getLatestRelease).toHaveBeenCalledTimes(1);
    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryRepository.updateLastSeenTag).not.toHaveBeenCalled();
  });
});
