import { createServer } from 'node:net';
import * as grpc from '@grpc/grpc-js';
import {
  NotificationGrpcController,
  createNotificationGrpcHandlers,
} from '../../../src/modules/notification/grpc/notification.grpc.controller';
import { startNotificationGrpcServer } from '../../../src/modules/notification/grpc/grpc.server';
import { GrpcNotificationProvider } from '../../../src/modules/notification/grpc/grpc.provider';
import type { NotificationChannel } from '../../../src/modules/notification/delivery/notification-channel.interface';

const getFreePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to allocate a free TCP port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
};

describe('notification gRPC round-trip', () => {
  let grpcServer: grpc.Server | null = null;
  let provider: GrpcNotificationProvider | null = null;

  const channel: jest.Mocked<NotificationChannel> = {
    sendConfirmation: jest.fn().mockResolvedValue(undefined),
    sendRelease: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const port = await getFreePort();
    const controller = new NotificationGrpcController(channel);
    const handlers = createNotificationGrpcHandlers(controller);
    grpcServer = await startNotificationGrpcServer(handlers, '127.0.0.1', port);
    provider = new GrpcNotificationProvider(`127.0.0.1:${port}`);
  });

  afterAll(async () => {
    if (provider) {
      provider.close();
    }

    if (grpcServer) {
      await new Promise<void>((resolve) => {
        grpcServer?.tryShutdown(() => resolve());
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends confirmation through the full gRPC stack', async () => {
    await provider!.sendConfirmation(
      'sub-1',
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    expect(channel.sendConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );
  });

  it('sends release through the full gRPC stack', async () => {
    await provider!.sendRelease(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );

    expect(channel.sendRelease).toHaveBeenCalledWith(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );
  });

  it('returns INVALID_ARGUMENT for invalid confirmation request', async () => {
    await expect(
      provider!.sendConfirmation(
        'sub-1',
        'not-an-email',
        '',
        'not-a-url',
        'not-a-url',
      ),
    ).rejects.toMatchObject({
      code: grpc.status.INVALID_ARGUMENT,
    });

    expect(channel.sendConfirmation).not.toHaveBeenCalled();
  });

  it('returns INTERNAL when channel throws', async () => {
    channel.sendConfirmation.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(
      provider!.sendConfirmation(
        'sub-1',
        'user@example.com',
        'owner/repo',
        'https://app.example.com/confirm/token',
        'https://app.example.com/unsubscribe/token',
      ),
    ).rejects.toMatchObject({
      code: grpc.status.INTERNAL,
    });
  });
});
