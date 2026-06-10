export const confirmationEmailTemplate = (
  repository: string,
  confirmationUrl: string,
  unsubscribeUrl: string,
): { subject: string; text: string; html: string } => {
  return {
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
  };
};
