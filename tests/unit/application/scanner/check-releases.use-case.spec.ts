import { CheckReleasesUseCase } from '../../../../src/application/scanner/check-releases.use-case';
import { InMemoryRepositoryRepository } from '../../../fakes/in-memory-repository.repository';
import { FakeGitHubClient } from '../../../fakes/fake-github.client';
import { FakeEmailSender } from '../../../fakes/fake-email.sender';
import { SilentLogger } from '../../../fakes/silent.logger';
import { NotifyRepositorySubscribersUseCase } from '../../../../src/application/scanner/notify-repository-subscribers.use-case';
import { ReleaseEmailTemplate } from '../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';
import { GitHubClientPort } from '../../../../src/application/ports/github.client.port';
import { RateLimitError } from '../../../../src/domain/errors';

const buildUseCase = (overrides: Parameters<typeof build>[0] = {}) => build(overrides);

function build(o: {
  latestTag?: string | null;
  active?: Awaited<ReturnType<InMemoryRepositoryRepository['listActiveWithSubscribers']>>;
}) {
  const repos = new InMemoryRepositoryRepository();
  if (o.active) repos.activeOverride.push(...o.active);
  const github = new FakeGitHubClient({ latestTag: o.latestTag ?? null });
  const sender = new FakeEmailSender();
  const notify = new NotifyRepositorySubscribersUseCase(
    sender, new ReleaseEmailTemplate(new AppUrlBuilder('http://x')), new SilentLogger(),
  );
  const useCase = new CheckReleasesUseCase(repos, github, notify, new SilentLogger());
  return { useCase, repos, sender };
}

describe('CheckReleasesUseCase', () => {
  it('skips when latest tag is null or unchanged', async () => {
    const { useCase, repos } = buildUseCase({
      latestTag: 'v1',
      active: [{
        id: 'r1', fullName: 'owner/repo', lastSeenTag: 'v1', createdAt: new Date(),
        subscriptions: [],
      } as never],
    });
    await useCase.execute();
    expect(repos.tagUpdates).toEqual([]);
  });

  it('updates lastSeenTag when notifications succeed', async () => {
    const { useCase, repos, sender } = buildUseCase({
      latestTag: 'v2',
      active: [{
        id: 'r1', fullName: 'owner/repo', lastSeenTag: 'v1', createdAt: new Date(),
        subscriptions: [
          { id: 's1', email: 'a@b.c', confirmed: true, repositoryId: 'r1',
            confirmationToken: 'c', unsubscribeToken: 'u', createdAt: new Date() },
        ],
      } as never],
    });
    await useCase.execute();
    expect(sender.sent).toHaveLength(1);
    expect(repos.tagUpdates).toEqual([{ id: 'r1', tag: 'v2' }]);
  });

  it('does nothing when there are no active repositories', async () => {
    const { useCase, repos, sender } = buildUseCase({});
    await useCase.execute();
    expect(sender.sent).toEqual([]);
    expect(repos.tagUpdates).toEqual([]);
  });

  it('does not update lastSeenTag when at least one email fails', async () => {
    const repos = new InMemoryRepositoryRepository();
    repos.activeOverride.push({
      id: 'r1', fullName: 'owner/repo', lastSeenTag: 'v1', createdAt: new Date(),
      subscriptions: [
        { id: 's1', email: 'a@b.c', confirmed: true, repositoryId: 'r1',
          confirmationToken: 'c', unsubscribeToken: 'u1', createdAt: new Date() },
        { id: 's2', email: 'c@d.e', confirmed: true, repositoryId: 'r1',
          confirmationToken: 'c2', unsubscribeToken: 'u2', createdAt: new Date() },
      ],
    } as never);

    let calls = 0;
    const failingSender = {
      send: jest.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('SMTP failed');
      }),
    };
    const notify = new NotifyRepositorySubscribersUseCase(
      failingSender as never,
      new ReleaseEmailTemplate(new AppUrlBuilder('http://x')),
      new SilentLogger(),
    );
    const github = new FakeGitHubClient({ latestTag: 'v2' });
    const useCase = new CheckReleasesUseCase(repos, github, notify, new SilentLogger());

    await useCase.execute();
    expect(failingSender.send).toHaveBeenCalledTimes(2);
    expect(repos.tagUpdates).toEqual([]);
  });

  it('continues processing other repositories when one fails', async () => {
    const repos = new InMemoryRepositoryRepository();
    repos.activeOverride.push(
      {
        id: 'r1', fullName: 'owner/first', lastSeenTag: null, createdAt: new Date(),
        subscriptions: [],
      } as never,
      {
        id: 'r2', fullName: 'owner/second', lastSeenTag: null, createdAt: new Date(),
        subscriptions: [
          { id: 's1', email: 'a@b.c', confirmed: true, repositoryId: 'r2',
            confirmationToken: 'c', unsubscribeToken: 'u', createdAt: new Date() },
        ],
      } as never,
    );

    let call = 0;
    const github: GitHubClientPort = {
      async repoExists() { return true; },
      async getLatestReleaseTag() {
        call++;
        if (call === 1) throw new Error('GitHub unavailable');
        return 'v3';
      },
    };
    const sender = new FakeEmailSender();
    const notify = new NotifyRepositorySubscribersUseCase(
      sender,
      new ReleaseEmailTemplate(new AppUrlBuilder('http://x')),
      new SilentLogger(),
    );
    const useCase = new CheckReleasesUseCase(repos, github, notify, new SilentLogger());

    await useCase.execute();
    expect(sender.sent).toHaveLength(1);
    expect(repos.tagUpdates).toEqual([{ id: 'r2', tag: 'v3' }]);
  });

  it('stops current scan cycle when GitHub rate limit is reached', async () => {
    const repos = new InMemoryRepositoryRepository();
    repos.activeOverride.push(
      {
        id: 'r1', fullName: 'owner/first', lastSeenTag: null, createdAt: new Date(),
        subscriptions: [],
      } as never,
      {
        id: 'r2', fullName: 'owner/second', lastSeenTag: null, createdAt: new Date(),
        subscriptions: [],
      } as never,
    );

    let call = 0;
    const github: GitHubClientPort = {
      async repoExists() { return true; },
      async getLatestReleaseTag() {
        call++;
        if (call === 1) throw new RateLimitError();
        return 'v3';
      },
    };
    const sender = new FakeEmailSender();
    const notify = new NotifyRepositorySubscribersUseCase(
      sender,
      new ReleaseEmailTemplate(new AppUrlBuilder('http://x')),
      new SilentLogger(),
    );
    const useCase = new CheckReleasesUseCase(repos, github, notify, new SilentLogger());

    await useCase.execute();
    expect(call).toBe(1);
    expect(sender.sent).toEqual([]);
    expect(repos.tagUpdates).toEqual([]);
  });
});
