import { Subscription } from '../../../../src/domain/subscription/subscription.entity';
import { BadRequestError } from '../../../../src/domain/errors';

describe('Subscription.confirm', () => {
  it('returns a new instance with confirmed=true', () => {
    const sub = new Subscription('id', 'a@b.c', 'r1', 'c-tok', 'u-tok', false);
    const confirmed = sub.confirm();
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.id).toBe('id');
    expect(sub.confirmed).toBe(false); // immutability
  });

  it('throws BadRequestError when already confirmed', () => {
    const sub = new Subscription('id', 'a@b.c', 'r1', 'c-tok', 'u-tok', true);
    expect(() => sub.confirm()).toThrow(BadRequestError);
  });
});
