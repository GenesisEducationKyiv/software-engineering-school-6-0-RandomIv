import { EmailMessage } from '../../../application/ports/email.sender.port';
import { AppUrlBuilder } from '../app-url-builder';

export interface ReleaseEmailInput {
  to: string;
  repository: string;
  version: string;
  unsubscribeToken: string;
}

export class ReleaseEmailTemplate {
  constructor(private readonly urls: AppUrlBuilder) {}

  render(input: ReleaseEmailInput): EmailMessage {
    const releaseUrl = `https://github.com/${input.repository}/releases/tag/${input.version}`;
    const unsubscribeUrl = this.urls.webPath(`/unsubscribe/${input.unsubscribeToken}`);

    return {
      to: input.to,
      subject: `New release in ${input.repository}: ${input.version}`,
      text: `Hello!\n\nA new version has just been released in the ${input.repository} repository: ${input.version}.\n\nView release: ${releaseUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2c3e50;">New Release!</h2>
          <p>Version <strong style="color: #27ae60;">${input.version}</strong> has just been released in the <b>${input.repository}</b> repository.</p>
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
    };
  }
}
