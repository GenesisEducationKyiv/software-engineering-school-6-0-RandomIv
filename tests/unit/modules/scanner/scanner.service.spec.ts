import { logger } from '../../../../src/common/logger/logger';
import type { RepositoryWithSubscriptions } from '../../../../src/common/types/repository-with-subscriptions.type';
import type { Subscription } from '../../../../src/generated/prisma/client';
import { RateLimitError } from '../../../../src/common/errors';
import {
  ReleaseScannerService,
  ScannerService,
} from '../../../../src/modules/scanner/scanner.service';

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
  const repositoryService = {
    getActiveRepositories: jest.fn(),
    updateLastSeenTag: jest.fn(),
  };
  const githubService = {
    getLatestReleaseTag: jest.fn(),
  };
  const emailService = {
    sendReleaseEmail: jest.fn(),
  };

  const service = new ReleaseScannerService({
    repositoryService,
    githubService,
    emailService,
  });

  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Шпигуємо за методами нашого професійного логера
    loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation();
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('does nothing when there are no active repositories', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([]);

    await service.checkReleases();

    expect(githubService.getLatestReleaseTag).not.toHaveBeenCalled();
    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryService.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('skips repository when latest tag is null', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([
      createRepository(),
    ]);
    githubService.getLatestReleaseTag.mockResolvedValueOnce(null);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryService.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('skips repository when latest tag equals lastSeenTag', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([
      createRepository({ lastSeenTag: 'v1.0.0' }),
    ]);
    githubService.getLatestReleaseTag.mockResolvedValueOnce('v1.0.0');

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryService.updateLastSeenTag).not.toHaveBeenCalled();
  });

  it('sends notifications and updates lastSeenTag when all emails succeed', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([
      createRepository({
        subscriptions: [
          createSubscription('sub-1', 'a@example.com'),
          createSubscription('sub-2', 'b@example.com'),
        ],
      }),
    ]);
    githubService.getLatestReleaseTag.mockResolvedValueOnce('v2.0.0');
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
      'sub-1-unsubscribe-token',
    );
    expect(emailService.sendReleaseEmail).toHaveBeenNthCalledWith(
      2,
      'b@example.com',
      'owner/repo',
      'v2.0.0',
      'sub-2-unsubscribe-token',
    );
    expect(repositoryService.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-1',
      'v2.0.0',
    );
  });

  it('does not update lastSeenTag when at least one email fails', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([
      createRepository({
        subscriptions: [
          createSubscription('sub-1', 'a@example.com'),
          createSubscription('sub-2', 'b@example.com'),
        ],
      }),
    ]);
    githubService.getLatestReleaseTag.mockResolvedValueOnce('v2.0.0');
    emailService.sendReleaseEmail
      .mockRejectedValueOnce(new Error('SMTP failed'))
      .mockResolvedValueOnce({ messageId: 'ok' } as never);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).toHaveBeenCalledTimes(2);
    expect(repositoryService.updateLastSeenTag).not.toHaveBeenCalled();
    // Перевіряємо, що помилка залогована в logger.error
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('continues processing next repositories when one repository fails', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([
      createRepository({ id: 'repo-1', fullName: 'owner/first' }),
      createRepository({ id: 'repo-2', fullName: 'owner/second' }),
    ]);
    githubService.getLatestReleaseTag
      .mockRejectedValueOnce(new Error('GitHub unavailable'))
      .mockResolvedValueOnce('v3.0.0');
    emailService.sendReleaseEmail.mockResolvedValue({
      messageId: 'ok',
    } as never);

    await service.checkReleases();

    expect(emailService.sendReleaseEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendReleaseEmail).toHaveBeenCalledWith(
      'user@example.com',
      'owner/second',
      'v3.0.0',
      'sub-1-unsubscribe-token',
    );
    expect(repositoryService.updateLastSeenTag).toHaveBeenCalledTimes(1);
    expect(repositoryService.updateLastSeenTag).toHaveBeenCalledWith(
      'repo-2',
      'v3.0.0',
    );
    // Перевіряємо, що фейл першої репи теж залогований
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('stops current scan cycle when GitHub rate limit is reached', async () => {
    repositoryService.getActiveRepositories.mockResolvedValue([
      createRepository({ id: 'repo-1', fullName: 'owner/first' }),
      createRepository({ id: 'repo-2', fullName: 'owner/second' }),
    ]);
    githubService.getLatestReleaseTag
      .mockRejectedValueOnce(new RateLimitError())
      .mockResolvedValueOnce('v3.0.0');

    await service.checkReleases();

    expect(githubService.getLatestReleaseTag).toHaveBeenCalledTimes(1);
    expect(emailService.sendReleaseEmail).not.toHaveBeenCalled();
    expect(repositoryService.updateLastSeenTag).not.toHaveBeenCalled();

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[Scanner] GitHub API rate limit hit. Pausing scanner until next cron cycle.',
    );
  });
});
