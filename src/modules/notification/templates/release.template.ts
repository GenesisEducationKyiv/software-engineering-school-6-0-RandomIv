export const releaseEmailTemplate = (
  repository: string,
  version: string,
  releaseUrl: string,
  unsubscribeUrl: string,
): { text: string; html: string } => {
  return {
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
  };
};
