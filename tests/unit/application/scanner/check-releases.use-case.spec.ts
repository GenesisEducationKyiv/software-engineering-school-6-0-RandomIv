import { CheckReleasesUseCase } from '../../../../src/application/scanner/check-releases.use-case';
import { InMemoryRepositoryRepository } from '../../../fakes/in-memory-repository.repository';
import { FakeGitHubClient } from '../../../fakes/fake-github.client';
import { FakeEmailSender } from '../../../fakes/fake-email.sender';
import { SilentLogger } from '../../../fakes/silent.logger';
import { NotifyRepositorySubscribersUseCase } from '../../../../src/application/scanner/notify-repository-subscribers.use-case';
import { ReleaseEmailTemplate } from '../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';

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
});
