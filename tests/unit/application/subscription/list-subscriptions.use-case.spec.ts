import { ListSubscriptionsUseCase } from '../../../../src/application/subscription/list-subscriptions.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';

describe('ListSubscriptionsUseCase', () => {
  it('returns only confirmed subscriptions for the given email', async () => {
    const subs = new InMemorySubscriptionRepository();
    const a = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    await subs.create({ email: 'a@b.c', repositoryId: 'r2' });
    await subs.markConfirmed(a.id);
    const useCase = new ListSubscriptionsUseCase(subs);

    const result = await useCase.execute({ email: 'a@b.c' });

    expect(result).toHaveLength(1);
  });
});
