import type * as grpc from '@grpc/grpc-js';
import type { NotificationChannel } from '../delivery/notification-channel.interface';
import { confirmationSchema, releaseSchema } from '../notification.schema';
import { withUnaryHandler } from '../../../core/grpc/with-unary-handler';
import type {
  SendConfirmationRequest,
  SendConfirmationResponse,
  SendReleaseRequest,
  SendReleaseResponse,
} from '../../../generated/v1/notification';

export class NotificationGrpcController {
  constructor(private readonly channel: NotificationChannel) {}

  public sendConfirmation = withUnaryHandler<
    SendConfirmationRequest,
    SendConfirmationResponse
  >(async (call) => {
    const { to, repo, confirmationUrl, unsubscribeUrl } =
      confirmationSchema.parse(call.request);
    await this.channel.sendConfirmation(
      to,
      repo,
      confirmationUrl,
      unsubscribeUrl,
    );
    return { message: 'Confirmation sent' };
  });

  public sendRelease = withUnaryHandler<
    SendReleaseRequest,
    SendReleaseResponse
  >(async (call) => {
    const { to, repo, tag, releaseUrl, unsubscribeUrl } = releaseSchema.parse(
      call.request,
    );
    await this.channel.sendRelease(to, repo, tag, releaseUrl, unsubscribeUrl);
    return { message: 'Release notification sent' };
  });
}

export interface NotificationGrpcHandlers
  extends grpc.UntypedServiceImplementation {
  sendConfirmation: grpc.handleUnaryCall<
    SendConfirmationRequest,
    SendConfirmationResponse
  >;
  sendRelease: grpc.handleUnaryCall<SendReleaseRequest, SendReleaseResponse>;
}

export const createNotificationGrpcHandlers = (
  controller: NotificationGrpcController,
): NotificationGrpcHandlers => ({
  sendConfirmation: controller.sendConfirmation,
  sendRelease: controller.sendRelease,
});
