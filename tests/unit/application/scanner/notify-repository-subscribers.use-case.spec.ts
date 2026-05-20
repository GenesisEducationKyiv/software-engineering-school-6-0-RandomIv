import { NotifyRepositorySubscribersUseCase } from '../../../../src/application/scanner/notify-repository-subscribers.use-case';
import { FakeEmailSender } from '../../../fakes/fake-email.sender';
import { ReleaseEmailTemplate } from '../../../../src/infrastructure/email/templates/release-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';
import { SilentLogger } from '../../../fakes/silent.logger';

const tpl = () => new ReleaseEmailTemplate(new AppUrlBuilder('http://x'));

describe('NotifyRepositorySubscribersUseCase', () => {
  it('returns true when all subscribers succeed', async () => {
    const sender = new FakeEmailSender();
    const useCase = new NotifyRepositorySubscribersUseCase(sender, tpl(), new SilentLogger());

    const ok = await useCase.execute({
      repository: 'owner/repo',
      version: 'v1',
      subscribers: [
        { email: 'a@b.c', unsubscribeToken: 't1' },
        { email: 'c@d.e', unsubscribeToken: 't2' },
      ],
    });

    expect(ok).toBe(true);
    expect(sender.sent).toHaveLength(2);
  });

  it('returns false when any subscriber fails', async () => {
    let calls = 0;
    const sender = { send: jest.fn(async () => { calls++; if (calls === 2) throw new Error('boom'); }) };
    const useCase = new NotifyRepositorySubscribersUseCase(sender as never, tpl(), new SilentLogger());

    const ok = await useCase.execute({
      repository: 'owner/repo',
      version: 'v1',
      subscribers: [
        { email: 'a@b.c', unsubscribeToken: 't1' },
        { email: 'c@d.e', unsubscribeToken: 't2' },
      ],
    });

    expect(ok).toBe(false);
  });
});
