import { Transporter } from 'nodemailer';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from '../../common/errors';
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
        subject: `Confirm subscription for ${repository}`,
        text: template.text,
        html: template.html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        `Failed to send email to ${to}: ${reason}`,
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
        subject: `New release in ${repository}: ${version}`,
        text: template.text,
        html: template.html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        `Failed to send email to ${to}: ${reason}`,
      );
    }
  }
}
