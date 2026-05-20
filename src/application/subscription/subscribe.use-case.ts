import { SubscriptionRepositoryPort } from '../ports/subscription.repository.port';
import { RepositoryRepositoryPort } from '../ports/repository.repository.port';
import { GitHubClientPort } from '../ports/github.client.port';
import { EmailSenderPort } from '../ports/email.sender.port';
import { LoggerPort } from '../ports/logger.port';
import { NotFoundError } from '../../domain/errors';
import { ConfirmationEmailTemplate } from '../../infrastructure/email/templates/confirmation-email.template';

export interface SubscribeInput { email: string; repo: string; }

export class SubscribeUseCase {
  constructor(
    private readonly subscriptions: SubscriptionRepositoryPort,
    private readonly repositories: RepositoryRepositoryPort,
    private readonly github: GitHubClientPort,
    private readonly email: EmailSenderPort,
    private readonly confirmationTemplate: ConfirmationEmailTemplate,
    private readonly logger: LoggerPort,
  ) {}

  async execute(input: SubscribeInput): Promise<void> {
    if (!(await this.github.repoExists(input.repo))) {
      throw new NotFoundError('Repository not found on GitHub');
    }
    const repository = await this.repositories.getOrCreate(input.repo);
    const subscription = await this.subscriptions.create({
      email: input.email,
      repositoryId: repository.id,
    });

    try {
      await this.email.send(this.confirmationTemplate.render(subscription, input.repo));
    } catch (error) {
      await this.subscriptions.deleteById(subscription.id);
      this.logger.error({ err: error, email: input.email }, '[Subscribe] Rolled back subscription after email failure');
      throw error;
    }
  }
}
