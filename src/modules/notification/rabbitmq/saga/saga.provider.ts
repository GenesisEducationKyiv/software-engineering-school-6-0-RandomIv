import type { ConfirmationPort } from '../../../../common/interfaces/confirmation-port.interface';
import type { MessagePublisher } from '../../../../common/interfaces/message-publisher.interface';
import type { SendConfirmationCommand } from './saga.contract';

export class SagaConfirmationProvider implements ConfirmationPort {
  constructor(
    private readonly publisher: MessagePublisher<SendConfirmationCommand>,
  ) {}

  async sendConfirmation(
    id: string,
    to: string,
    repo: string,
    confUrl: string,
    unsubUrl: string,
  ): Promise<void> {
    await this.publisher.publish({
      subscriptionId: id,
      to,
      repo,
      confirmationUrl: confUrl,
      unsubscribeUrl: unsubUrl,
    });
  }
}
