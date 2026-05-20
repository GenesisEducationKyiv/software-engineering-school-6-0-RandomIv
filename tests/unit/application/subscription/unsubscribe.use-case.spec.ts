import { UnsubscribeUseCase } from '../../../../src/application/subscription/unsubscribe.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';
import { NotFoundError } from '../../../../src/domain/errors';

describe('UnsubscribeUseCase', () => {
  it('removes the subscription matching the token', async () => {
    const subs = new InMemorySubscriptionRepository();
    const created = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    const useCase = new UnsubscribeUseCase(subs);

    await useCase.execute({ token: created.unsubscribeToken });

    expect(subs.all()).toEqual([]);
  });

  it('throws NotFoundError if no subscription has that token', async () => {
    const useCase = new UnsubscribeUseCase(new InMemorySubscriptionRepository());
    await expect(useCase.execute({ token: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
