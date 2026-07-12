import * as grpc from '@grpc/grpc-js';
import { GrpcNotificationProvider } from '../../../../../src/modules/notification/grpc/grpc.provider';

const mockSendConfirmation = jest.fn();
const mockSendRelease = jest.fn();
const mockClose = jest.fn();

jest.mock('../../../../../src/generated/notification/v1/notification', () => ({
  NotificationServiceClient: jest.fn().mockImplementation(() => ({
    sendConfirmation: mockSendConfirmation,
    sendRelease: mockSendRelease,
    close: mockClose,
  })),
}));

describe('GrpcNotificationProvider', () => {
  let provider: GrpcNotificationProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new GrpcNotificationProvider('localhost:50061');
  });

  describe('sendConfirmation', () => {
    it('calls the gRPC client with correct parameters', async () => {
      mockSendConfirmation.mockImplementation(
        (
          _req: unknown,
          _metadata: grpc.Metadata,
          _options: Partial<grpc.CallOptions>,
          callback: (err: Error | null, res: { message: string }) => void,
        ) => {
          callback(null, { message: 'Confirmation sent' });
        },
      );

      await provider.sendConfirmation(
        'sub-1',
        'user@example.com',
        'owner/repo',
        'https://app.example.com/confirm/token',
        'https://app.example.com/unsubscribe/token',
      );

      expect(mockSendConfirmation).toHaveBeenCalledWith(
        {
          to: 'user@example.com',
          repo: 'owner/repo',
          confirmationUrl: 'https://app.example.com/confirm/token',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        },
        expect.any(grpc.Metadata),
        expect.objectContaining({ deadline: expect.any(Number) }),
        expect.any(Function),
      );
    });

    it('propagates gRPC errors', async () => {
      mockSendConfirmation.mockImplementation(
        (
          _req: unknown,
          _metadata: grpc.Metadata,
          _options: Partial<grpc.CallOptions>,
          callback: (err: Error) => void,
        ) => {
          callback(new Error('Connection refused'));
        },
      );

      await expect(
        provider.sendConfirmation(
          'sub-1',
          'user@example.com',
          'owner/repo',
          'https://app.example.com/confirm/token',
          'https://app.example.com/unsubscribe/token',
        ),
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('sendRelease', () => {
    it('calls the gRPC client with correct parameters', async () => {
      mockSendRelease.mockImplementation(
        (
          _req: unknown,
          _metadata: grpc.Metadata,
          _options: Partial<grpc.CallOptions>,
          callback: (err: Error | null, res: { message: string }) => void,
        ) => {
          callback(null, { message: 'Release notification sent' });
        },
      );

      await provider.sendRelease(
        'user@example.com',
        'owner/repo',
        'v2.0.0',
        'https://github.com/owner/repo/releases/tag/v2.0.0',
        'https://app.example.com/unsubscribe/token',
      );

      expect(mockSendRelease).toHaveBeenCalledWith(
        {
          to: 'user@example.com',
          repo: 'owner/repo',
          tag: 'v2.0.0',
          releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
          unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
        },
        expect.any(grpc.Metadata),
        expect.objectContaining({ deadline: expect.any(Number) }),
        expect.any(Function),
      );
    });

    it('propagates gRPC errors', async () => {
      mockSendRelease.mockImplementation(
        (
          _req: unknown,
          _metadata: grpc.Metadata,
          _options: Partial<grpc.CallOptions>,
          callback: (err: Error) => void,
        ) => {
          callback(new Error('Connection refused'));
        },
      );

      await expect(
        provider.sendRelease(
          'user@example.com',
          'owner/repo',
          'v2.0.0',
          'https://github.com/owner/repo/releases/tag/v2.0.0',
          'https://app.example.com/unsubscribe/token',
        ),
      ).rejects.toThrow('Connection refused');
    });
  });

  describe('close', () => {
    it('closes the underlying gRPC client', () => {
      provider.close();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
