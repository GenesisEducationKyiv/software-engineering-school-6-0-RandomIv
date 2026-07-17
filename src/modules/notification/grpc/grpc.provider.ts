import { promisify } from 'node:util';
import * as grpc from '@grpc/grpc-js';
import type { ConfirmationPort } from '../../../common/interfaces/confirmation-port.interface';
import type { ReleaseNotificationPort } from '../../../common/interfaces/release-notification-port.interface';
import {
  NotificationServiceClient,
  type SendConfirmationRequest,
  type SendConfirmationResponse,
  type SendReleaseRequest,
  type SendReleaseResponse,
} from '../../../generated/notification/v1/notification';

const GRPC_CALL_TIMEOUT_MS = 5000;

type UnaryMethod<Req, Res> = (
  request: Req,
  metadata: grpc.Metadata,
  options: Partial<grpc.CallOptions>,
  callback: (error: grpc.ServiceError | null, response: Res) => void,
) => grpc.ClientUnaryCall;

export class GrpcNotificationProvider
  implements ConfirmationPort, ReleaseNotificationPort
{
  private readonly client: NotificationServiceClient;
  private readonly sendConfirmationCall: (
    request: SendConfirmationRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
  ) => Promise<SendConfirmationResponse>;
  private readonly sendReleaseCall: (
    request: SendReleaseRequest,
    metadata: grpc.Metadata,
    options: Partial<grpc.CallOptions>,
  ) => Promise<SendReleaseResponse>;

  constructor(address: string) {
    this.client = new NotificationServiceClient(
      address,
      grpc.credentials.createInsecure(),
    );
    this.sendConfirmationCall = promisify(
      (
        this.client.sendConfirmation as UnaryMethod<
          SendConfirmationRequest,
          SendConfirmationResponse
        >
      ).bind(this.client),
    );
    this.sendReleaseCall = promisify(
      (
        this.client.sendRelease as UnaryMethod<
          SendReleaseRequest,
          SendReleaseResponse
        >
      ).bind(this.client),
    );
  }

  private callOptions(): Partial<grpc.CallOptions> {
    return { deadline: Date.now() + GRPC_CALL_TIMEOUT_MS };
  }

  async sendConfirmation(
    _subscriptionId: string,
    to: string,
    repo: string,
    confirmationUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.sendConfirmationCall(
      { to, repo, confirmationUrl, unsubscribeUrl },
      new grpc.Metadata(),
      this.callOptions(),
    );
  }

  async sendRelease(
    to: string,
    repo: string,
    tag: string,
    releaseUrl: string,
    unsubscribeUrl: string,
  ): Promise<void> {
    await this.sendReleaseCall(
      { to, repo, tag, releaseUrl, unsubscribeUrl },
      new grpc.Metadata(),
      this.callOptions(),
    );
  }

  close(): void {
    this.client.close();
  }
}
