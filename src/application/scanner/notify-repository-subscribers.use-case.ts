import { EmailSenderPort } from '../ports/email.sender.port';
import { LoggerPort } from '../ports/logger.port';
import { ReleaseEmailTemplate } from '../../infrastructure/email/templates/release-email.template';

export interface NotifyInput {
  repository: string;
  version: string;
  subscribers: { email: string; unsubscribeToken: string }[];
}

export class NotifyRepositorySubscribersUseCase {
  constructor(
    private readonly email: EmailSenderPort,
    private readonly template: ReleaseEmailTemplate,
    private readonly logger: LoggerPort,
  ) {}

  async execute(input: NotifyInput): Promise<boolean> {
    let allOk = true;
    for (const sub of input.subscribers) {
      try {
        await this.email.send(this.template.render({
          to: sub.email,
          repository: input.repository,
          version: input.version,
          unsubscribeToken: sub.unsubscribeToken,
        }));
      } catch (error) {
        allOk = false;
        this.logger.error(
          { email: sub.email, repository: input.repository, err: error },
          '[Scanner] Failed to notify subscriber',
        );
      }
    }
    return allOk;
  }
}
