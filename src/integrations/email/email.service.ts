import { Transporter } from 'nodemailer';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from '../../common/errors';
import { logger } from '../../core/logger';
import { confirmationEmailTemplate } from './templates/confirmation.template';
import { releaseEmailTemplate } from './templates/release.template';

export interface NodemailerServiceDependencies {
  transporter: Transporter;
  emailUser: string;
}

export interface EmailService {
  sendSubscriptionConfirmationEmail(
    to: string,
    repository: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void>;

  sendReleaseEmail(
    to: string,
    repository: string,
    version: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void>;
}

export class NodemailerService implements EmailService {
  private readonly transporter: Transporter;
  private readonly emailUser: string;

  constructor(dependencies: NodemailerServiceDependencies) {
    this.emailUser = dependencies.emailUser;
    this.transporter = dependencies.transporter;
  }

  async sendSubscriptionConfirmationEmail(
    to: string,
    repository: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    const template = confirmationEmailTemplate(
      repository,
      confirmationUrl,
      unsubscribeUrl,
    );

    try {
      await this.transporter.sendMail({
        from: `"GitHub Release Notifier" <${this.emailUser}>`,
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
    } catch (error) {
      logger.error({ err: error, to }, 'Failed to send confirmation email');
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to send email. Please try again later.',
      );
    }
  }

  async sendReleaseEmail(
    to: string,
    repository: string,
    version: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    const template = releaseEmailTemplate(
      repository,
      version,
      releaseUrl,
      unsubscribeUrl,
    );

    try {
      await this.transporter.sendMail({
        from: `"GitHub Release Notifier" <${this.emailUser}>`,
        to,
        subject: template.subject,
        text: template.text,
        html: template.html,
      });
    } catch (error) {
      logger.error({ err: error, to }, 'Failed to send release email');
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to send email. Please try again later.',
      );
    }
  }
}
