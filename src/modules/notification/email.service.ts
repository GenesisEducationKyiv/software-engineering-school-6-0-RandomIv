import nodemailer, { SentMessageInfo } from 'nodemailer';
import { HttpStatus } from '../../common/constants/http-status.constants';
import { AppError } from '../../common/errors';
import { config } from '../../config';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.EMAIL_USER,
    pass: config.EMAIL_PASS,
  },
});

const getAppBaseUrl = (): string => {
  return config.APP_BASE_URL ?? `http://localhost:${config.PORT}`;
};

const buildWebUrl = (path: string): string => {
  return `${getAppBaseUrl().replace(/\/+$/, '')}/web${path}`;
};

export const sendSubscriptionConfirmationEmail = async (
  to: string,
  repository: string,
  confirmationToken: string,
  unsubscribeToken: string,
): Promise<SentMessageInfo> => {
  const confirmationUrl = buildWebUrl(`/confirm/${confirmationToken}`);
  const unsubscribeUrl = buildWebUrl(`/unsubscribe/${unsubscribeToken}`);

  try {
    const info = await transporter.sendMail({
      from: `"GitHub Release Notifier" <${config.EMAIL_USER}>`,
      to,
      subject: `Confirm subscription for ${repository}`,
      text: `Hello!\n\nPlease confirm your subscription for ${repository} release notifications:\n${confirmationUrl}\n\nIf you did not request this, you can unsubscribe here:\n${unsubscribeUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2c3e50;">Confirm subscription</h2>
          <p>Please confirm your subscription for <b>${repository}</b> release notifications.</p>
          <p>
            <a href="${confirmationUrl}" style="background-color: #27ae60; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Confirm subscription
            </a>
          </p>
          <p style="margin-top: 20px;">If you did not request this, you can unsubscribe:
            <a href="${unsubscribeUrl}">${unsubscribeUrl}</a>
          </p>
        </div>
      `,
    });
    return info;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `Failed to send email to ${to}: ${reason}`,
    );
  }
};

export const sendReleaseEmail = async (
  to: string,
  repository: string,
  version: string,
  unsubscribeToken: string,
): Promise<SentMessageInfo> => {
  const releaseUrl = `https://github.com/${repository}/releases/tag/${version}`;
  const unsubscribeUrl = buildWebUrl(`/unsubscribe/${unsubscribeToken}`);

  try {
    const info = await transporter.sendMail({
      from: `"GitHub Release Notifier" <${config.EMAIL_USER}>`,
      to,
      subject: `New release in ${repository}: ${version}`,
      text: `Hello!\n\nA new version has just been released in the ${repository} repository: ${version}.\n\nView release: ${releaseUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2c3e50;">New Release!</h2>
          <p>Version <strong style="color: #27ae60;">${version}</strong> has just been released in the <b>${repository}</b> repository.</p>
          <p>
            <a href="${releaseUrl}" style="background-color: #2980b9; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View on GitHub
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;" />
          <small style="color: #999;">You received this email because you subscribed to notifications via GitHub Notifier.</small>
          <br />
          <small style="color: #999;">Unsubscribe: <a href="${unsubscribeUrl}">${unsubscribeUrl}</a></small>
        </div>
      `,
    });

    return info;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      `Failed to send email to ${to}: ${reason}`,
    );
  }
};
