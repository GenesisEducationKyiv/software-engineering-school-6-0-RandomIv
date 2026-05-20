import { BadRequestError } from '../errors';

export class Subscription {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly repositoryId: string,
    public readonly confirmationToken: string,
    public readonly unsubscribeToken: string,
    public readonly confirmed: boolean,
  ) {}

  confirm(): Subscription {
    if (this.confirmed) throw new BadRequestError('Token already used');
    return new Subscription(
      this.id, this.email, this.repositoryId,
      this.confirmationToken, this.unsubscribeToken, true,
    );
  }
}
