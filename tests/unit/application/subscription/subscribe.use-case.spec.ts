import { SubscribeUseCase } from '../../../../src/application/subscription/subscribe.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';
import { InMemoryRepositoryRepository } from '../../../fakes/in-memory-repository.repository';
import { FakeGitHubClient } from '../../../fakes/fake-github.client';
import { FakeEmailSender, FailingEmailSender } from '../../../fakes/fake-email.sender';
import { SilentLogger } from '../../../fakes/silent.logger';
import { ConfirmationEmailTemplate } from '../../../../src/infrastructure/email/templates/confirmation-email.template';
import { AppUrlBuilder } from '../../../../src/infrastructure/email/app-url-builder';
import { NotFoundError } from '../../../../src/domain/errors';

const tpl = () => new ConfirmationEmailTemplate(new AppUrlBuilder('http://x'));

describe('SubscribeUseCase', () => {
  it('throws NotFoundError if GitHub says repo does not exist', async () => {
    const useCase = new SubscribeUseCase(
      new InMemorySubscriptionRepository(),
      new InMemoryRepositoryRepository(),
      new FakeGitHubClient({ exists: false }),
      new FakeEmailSender(),
      tpl(),
      new SilentLogger(),
    );
    await expect(useCase.execute({ email: 'a@b.c', repo: 'x/y' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sends a confirmation email on the happy path', async () => {
    const email = new FakeEmailSender();
    const subs = new InMemorySubscriptionRepository();
    const useCase = new SubscribeUseCase(
      subs, new InMemoryRepositoryRepository(),
      new FakeGitHubClient({ exists: true }),
      email, tpl(), new SilentLogger(),
    );
    await useCase.execute({ email: 'a@b.c', repo: 'x/y' });
    expect(subs.all()).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe('a@b.c');
  });

  it('deletes the subscription if email send fails', async () => {
    const subs = new InMemorySubscriptionRepository();
    const useCase = new SubscribeUseCase(
      subs, new InMemoryRepositoryRepository(),
      new FakeGitHubClient({ exists: true }),
      new FailingEmailSender(), tpl(), new SilentLogger(),
    );
    await expect(useCase.execute({ email: 'a@b.c', repo: 'x/y' })).rejects.toThrow();
    expect(subs.all()).toEqual([]);
  });
});
