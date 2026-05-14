import { SentMessageInfo, Transporter } from 'nodemailer';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from '../../common/errors';
import { confirmationEmailTemplate } from './templates/confirmation.template';
import { releaseEmailTemplate } from './templates/release.template';

type MailTransporter = Pick<Transporter, 'sendMail'>;

export interface EmailServiceDependencies {
  transporter: MailTransporter;
  emailUser: string;
  appBaseUrl: string;
}

export interface EmailService {
  sendSubscriptionConfirmationEmail(
    to: string,
    repository: string,
    confirmationToken: string,
    unsubscribeToken: string,
  ): Promise<SentMessageInfo>;
  sendReleaseEmail(
    to: string,
    repository: string,
    version: string,
    unsubscribeToken: string,
  ): Promise<SentMessageInfo>;
}

export class NodemailerService implements EmailService {
  private readonly transporter: MailTransporter;
  private readonly emailUser: string;
  private readonly appBaseUrl: string;

  constructor(dependencies: EmailServiceDependencies) {
    this.emailUser = dependencies.emailUser;
    this.appBaseUrl = dependencies.appBaseUrl;
    this.transporter = dependencies.transporter;
  }

  async sendSubscriptionConfirmationEmail(
    to: string,
    repository: string,
    confirmationToken: string,
    unsubscribeToken: string,
  ): Promise<SentMessageInfo> {
    const confirmationUrl = this.buildWebUrl(`/confirm/${confirmationToken}`);
    const unsubscribeUrl = this.buildWebUrl(`/unsubscribe/${unsubscribeToken}`);

    const template = confirmationEmailTemplate(
      repository,
      confirmationUrl,
      unsubscribeUrl,
    );

    try {
      return await this.transporter.sendMail({
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
    unsubscribeToken: string,
  ): Promise<SentMessageInfo> {
    const releaseUrl = `https://github.com/${repository}/releases/tag/${version}`;
    const unsubscribeUrl = this.buildWebUrl(`/unsubscribe/${unsubscribeToken}`);

    const template = releaseEmailTemplate(
      repository,
      version,
      releaseUrl,
      unsubscribeUrl,
    );

    try {
      return await this.transporter.sendMail({
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

  private buildWebUrl(path: string): string {
    return `${this.appBaseUrl.replace(/\/+$/, '')}/web${path}`;
  }
}
