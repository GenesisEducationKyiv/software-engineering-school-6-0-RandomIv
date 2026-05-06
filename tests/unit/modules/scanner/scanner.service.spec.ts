import type { RepositoryWithSubscriptions } from '../../../../src/common/types/repository-with-subscriptions.type';
import type { Subscription } from '../../../../src/generated/prisma/client';
import { RateLimitError } from '../../../../src/common/errors';
import { logger } from '../../../../src/common/logger/logger';

jest.mock('../../../../src/modules/github/github.service', () => ({
  getLatestReleaseTag: jest.fn(),
}));

jest.mock('../../../../src/modules/notification/email.service', () => ({
  sendReleaseEmail: jest.fn(),
}));

jest.mock('../../../../src/modules/repository/repository.service', () => ({
  getActiveRepositories: jest.fn(),
  updateLastSeenTag: jest.fn(),
}));

import { getLatestReleaseTag } from '../../../../src/modules/github/github.service';
import { sendReleaseEmail } from '../../../../src/modules/notification/email.service';
import {
  getActiveRepositories,
  updateLastSeenTag,
} from '../../../../src/modules/repository/repository.service';
import { checkReleases } from '../../../../src/modules/scanner/scanner.service';

const mockedGetActiveRepositories = jest.mocked(getActiveRepositories);
const mockedGetLatestReleaseTag = jest.mocked(getLatestReleaseTag);
const mockedSendReleaseEmail = jest.mocked(sendReleaseEmail);
const mockedUpdateLastSeenTag = jest.mocked(updateLastSeenTag);

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
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  it('does nothing when there are no active repositories', async () => {
    mockedGetActiveRepositories.mockResolvedValue([]);

    await checkReleases();

    expect(mockedGetLatestReleaseTag).not.toHaveBeenCalled();
    expect(mockedSendReleaseEmail).not.toHaveBeenCalled();
    expect(mockedUpdateLastSeenTag).not.toHaveBeenCalled();
  });

  it('skips repository when latest tag is null', async () => {
    mockedGetActiveRepositories.mockResolvedValue([createRepository()]);
    mockedGetLatestReleaseTag.mockResolvedValueOnce(null);

    await checkReleases();

    expect(mockedSendReleaseEmail).not.toHaveBeenCalled();
    expect(mockedUpdateLastSeenTag).not.toHaveBeenCalled();
  });

  it('skips repository when latest tag equals lastSeenTag', async () => {
    mockedGetActiveRepositories.mockResolvedValue([
      createRepository({ lastSeenTag: 'v1.0.0' }),
    ]);
    mockedGetLatestReleaseTag.mockResolvedValueOnce('v1.0.0');

    await checkReleases();

    expect(mockedSendReleaseEmail).not.toHaveBeenCalled();
    expect(mockedUpdateLastSeenTag).not.toHaveBeenCalled();
  });

  it('sends notifications and updates lastSeenTag when all emails succeed', async () => {
    mockedGetActiveRepositories.mockResolvedValue([
      createRepository({
        subscriptions: [
          createSubscription('sub-1', 'a@example.com'),
          createSubscription('sub-2', 'b@example.com'),
        ],
      }),
    ]);
    mockedGetLatestReleaseTag.mockResolvedValueOnce('v2.0.0');
    mockedSendReleaseEmail.mockResolvedValue({
      messageId: 'ok',
    } as never);

    await checkReleases();

    expect(mockedSendReleaseEmail).toHaveBeenCalledTimes(2);
    expect(mockedSendReleaseEmail).toHaveBeenNthCalledWith(
      1,
      'a@example.com',
      'owner/repo',
      'v2.0.0',
      'sub-1-unsubscribe-token',
    );
    expect(mockedSendReleaseEmail).toHaveBeenNthCalledWith(
      2,
      'b@example.com',
      'owner/repo',
      'v2.0.0',
      'sub-2-unsubscribe-token',
    );
    expect(mockedUpdateLastSeenTag).toHaveBeenCalledWith('repo-1', 'v2.0.0');
  });

  it('does not update lastSeenTag when at least one email fails', async () => {
    mockedGetActiveRepositories.mockResolvedValue([
      createRepository({
        subscriptions: [
          createSubscription('sub-1', 'a@example.com'),
          createSubscription('sub-2', 'b@example.com'),
        ],
      }),
    ]);
    mockedGetLatestReleaseTag.mockResolvedValueOnce('v2.0.0');
    mockedSendReleaseEmail
      .mockRejectedValueOnce(new Error('SMTP failed'))
      .mockResolvedValueOnce({ messageId: 'ok' } as never);

    await checkReleases();

    expect(mockedSendReleaseEmail).toHaveBeenCalledTimes(2);
    expect(mockedUpdateLastSeenTag).not.toHaveBeenCalled();
  });

  it('continues processing next repositories when one repository fails', async () => {
    mockedGetActiveRepositories.mockResolvedValue([
      createRepository({ id: 'repo-1', fullName: 'owner/first' }),
      createRepository({ id: 'repo-2', fullName: 'owner/second' }),
    ]);
    mockedGetLatestReleaseTag
      .mockRejectedValueOnce(new Error('GitHub unavailable'))
      .mockResolvedValueOnce('v3.0.0');
    mockedSendReleaseEmail.mockResolvedValue({ messageId: 'ok' } as never);

    await checkReleases();

    expect(mockedSendReleaseEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendReleaseEmail).toHaveBeenCalledWith(
      'user@example.com',
      'owner/second',
      'v3.0.0',
      'sub-1-unsubscribe-token',
    );
    expect(mockedUpdateLastSeenTag).toHaveBeenCalledTimes(1);
    expect(mockedUpdateLastSeenTag).toHaveBeenCalledWith('repo-2', 'v3.0.0');
  });

  it('stops current scan cycle when GitHub rate limit is reached', async () => {
    mockedGetActiveRepositories.mockResolvedValue([
      createRepository({ id: 'repo-1', fullName: 'owner/first' }),
      createRepository({ id: 'repo-2', fullName: 'owner/second' }),
    ]);
    mockedGetLatestReleaseTag
      .mockRejectedValueOnce(new RateLimitError())
      .mockResolvedValueOnce('v3.0.0');

    await checkReleases();

    expect(mockedGetLatestReleaseTag).toHaveBeenCalledTimes(1);
    expect(mockedSendReleaseEmail).not.toHaveBeenCalled();
    expect(mockedUpdateLastSeenTag).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[Scanner] GitHub API rate limit hit. Pausing scanner until next cron cycle.',
    );
  });
});
