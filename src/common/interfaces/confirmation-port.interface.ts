export interface ConfirmationPort {
  sendConfirmation(
    subscriptionId: string,
    to: string,
    repo: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void>;
}
