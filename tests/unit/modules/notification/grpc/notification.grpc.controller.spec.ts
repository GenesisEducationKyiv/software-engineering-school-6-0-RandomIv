import type * as grpc from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { NotificationGrpcController } from '../../../../../src/modules/notification/grpc/notification.grpc.controller';
import type { NotificationChannel } from '../../../../../src/modules/notification/delivery/notification-channel.interface';

jest.mock('../../../../../src/core/metrics/prometheus', () => ({
  getGrpcMetrics: () => ({
    requestCounter: { inc: jest.fn() },
    requestDurationHistogram: { startTimer: () => jest.fn() },
  }),
}));

const createMockCall = <TRequest>(
  request: TRequest,
  path = '/notification.v1.NotificationService/SendConfirmation',
): grpc.ServerUnaryCall<TRequest, unknown> =>
  ({
    request,
    getPath: () => path,
    metadata: {} as grpc.Metadata,
  }) as unknown as grpc.ServerUnaryCall<TRequest, unknown>;

describe('NotificationGrpcController', () => {
  let channel: jest.Mocked<NotificationChannel>;
  let controller: NotificationGrpcController;

  beforeEach(() => {
    channel = {
      sendConfirmation: jest.fn().mockResolvedValue(undefined),
      sendRelease: jest.fn().mockResolvedValue(undefined),
    };
    controller = new NotificationGrpcController(channel);
  });

  describe('sendConfirmation', () => {
    const validRequest = {
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    it('delegates to channel.sendConfirmation and returns success message', (done) => {
      const call = createMockCall(validRequest);

      controller.sendConfirmation(call, (error: any, response: any) => {
        expect(error).toBeNull();
        expect(response).toEqual({ message: 'Confirmation sent' });
        expect(channel.sendConfirmation).toHaveBeenCalledWith(
          validRequest.to,
          validRequest.repo,
          validRequest.confirmationUrl,
          validRequest.unsubscribeUrl,
        );
        done();
      });
    });

    it('returns INVALID_ARGUMENT for invalid request', (done) => {
      const call = createMockCall({
        to: 'not-an-email',
        repo: '',
        confirmationUrl: '',
        unsubscribeUrl: '',
      });

      controller.sendConfirmation(call, (error: any) => {
        expect(error).toBeDefined();
        expect(error?.code).toBe(status.INVALID_ARGUMENT);
        done();
      });
    });

    it('returns INTERNAL when channel throws', (done) => {
      channel.sendConfirmation.mockRejectedValueOnce(new Error('SMTP down'));
      const call = createMockCall(validRequest);

      controller.sendConfirmation(call, (error: any) => {
        expect(error).toBeDefined();
        expect(error?.code).toBe(status.INTERNAL);
        done();
      });
    });
  });

  describe('sendRelease', () => {
    const validRequest = {
      to: 'user@example.com',
      repo: 'owner/repo',
      tag: 'v2.0.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    };

    it('delegates to channel.sendRelease and returns success message', (done) => {
      const call = createMockCall(
        validRequest,
        '/notification.v1.NotificationService/SendRelease',
      );

      controller.sendRelease(call, (error: any, response: any) => {
        expect(error).toBeNull();
        expect(response).toEqual({ message: 'Release notification sent' });
        expect(channel.sendRelease).toHaveBeenCalledWith(
          validRequest.to,
          validRequest.repo,
          validRequest.tag,
          validRequest.releaseUrl,
          validRequest.unsubscribeUrl,
        );
        done();
      });
    });

    it('returns INVALID_ARGUMENT for invalid request', (done) => {
      const call = createMockCall(
        {
          to: 'user@example.com',
          repo: 'owner/repo',
          tag: '',
          releaseUrl: '',
          unsubscribeUrl: '',
        },
        '/notification.v1.NotificationService/SendRelease',
      );

      controller.sendRelease(call, (error: any) => {
        expect(error).toBeDefined();
        expect(error?.code).toBe(status.INVALID_ARGUMENT);
        done();
      });
    });

    it('returns INTERNAL when channel throws', (done) => {
      channel.sendRelease.mockRejectedValueOnce(new Error('SMTP down'));
      const call = createMockCall(
        validRequest,
        '/notification.v1.NotificationService/SendRelease',
      );

      controller.sendRelease(call, (error: any) => {
        expect(error).toBeDefined();
        expect(error?.code).toBe(status.INTERNAL);
        done();
      });
    });
  });
});
