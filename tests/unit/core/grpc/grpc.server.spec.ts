import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { startGrpcServer } from '../../../../src/core/grpc/grpc.server';

jest.mock('@grpc/proto-loader');
jest.mock('@grpc/grpc-js', () => {
  const actual =
    jest.requireActual<typeof import('@grpc/grpc-js')>('@grpc/grpc-js');
  return {
    ...actual,
    loadPackageDefinition: jest.fn(),
    Server: jest.fn(),
  };
});

const mockedProtoLoader = protoLoader as jest.Mocked<typeof protoLoader>;
const mockedGrpc = grpc as jest.Mocked<typeof grpc> & {
  loadPackageDefinition: jest.Mock;
  Server: jest.Mock;
};

describe('grpc.server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when the loaded package is missing the ReleaseNotifier service', async () => {
    mockedProtoLoader.loadSync.mockReturnValue({} as never);
    mockedGrpc.loadPackageDefinition.mockReturnValue({});

    await expect(startGrpcServer({} as never)).rejects.toThrow(
      'Failed to load gRPC package release_notifier.ReleaseNotifier',
    );
  });

  it('rejects when server.bindAsync returns an error', async () => {
    const bindError = new Error('Address already in use');

    mockedProtoLoader.loadSync.mockReturnValue({} as never);
    mockedGrpc.loadPackageDefinition.mockReturnValue({
      release_notifier: {
        ReleaseNotifier: {
          service: {},
        },
      },
    });

    const fakeServer = {
      addService: jest.fn(),
      bindAsync: jest.fn(
        (
          _addr: string,
          _creds: unknown,
          cb: (err: Error | null, port: number) => void,
        ) => {
          cb(bindError, 0);
        },
      ),
    };
    mockedGrpc.Server.mockImplementation(() => fakeServer);

    await expect(startGrpcServer({} as never)).rejects.toThrow(
      'Address already in use',
    );
  });
});
