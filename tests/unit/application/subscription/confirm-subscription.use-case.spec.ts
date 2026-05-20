import { ConfirmSubscriptionUseCase } from '../../../../src/application/subscription/confirm-subscription.use-case';
import { InMemorySubscriptionRepository } from '../../../fakes/in-memory-subscription.repository';
import { NotFoundError, BadRequestError } from '../../../../src/domain/errors';

describe('ConfirmSubscriptionUseCase', () => {
  it('throws NotFoundError when token is unknown', async () => {
    const useCase = new ConfirmSubscriptionUseCase(new InMemorySubscriptionRepository());
    await expect(useCase.execute({ token: 'nope' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('marks subscription confirmed', async () => {
    const subs = new InMemorySubscriptionRepository();
    const created = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    const useCase = new ConfirmSubscriptionUseCase(subs);

    await useCase.execute({ token: created.confirmationToken });

    const found = await subs.findByConfirmationToken(created.confirmationToken);
    expect(found?.confirmed).toBe(true);
  });

  it('throws BadRequestError when already confirmed (delegates to entity invariant)', async () => {
    const subs = new InMemorySubscriptionRepository();
    const created = await subs.create({ email: 'a@b.c', repositoryId: 'r1' });
    await subs.markConfirmed(created.id);
    const useCase = new ConfirmSubscriptionUseCase(subs);
    await expect(useCase.execute({ token: created.confirmationToken })).rejects.toBeInstanceOf(BadRequestError);
  });
});
