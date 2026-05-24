import { HttpStatus } from '../../../../src/common/constants/http-status.constant';
import { AppError } from '../../../../src/common/errors';
import { HttpGitHubClient } from '../../../../src/integrations/github/http-github.client';
import { httpClient } from '../../../../src/common/utils/http-client.util';

jest.mock('../../../../src/common/utils/http-client.util', () => ({
  httpClient: jest.fn(),
}));

jest.mock('../../../../src/config', () => ({
  config: {
    GITHUB_TOKEN: 'test_token',
  },
}));

describe('HttpGitHubClient', () => {
  const client = new HttpGitHubClient();
  const mockedHttpClient = jest.mocked(httpClient as unknown as jest.Mock);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch data with correct URL and headers', async () => {
    mockedHttpClient.mockResolvedValueOnce({ raw: 'data' });

    await client.get('owner/repo');

    expect(mockedHttpClient).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo',
      { headers: { Authorization: 'Bearer test_token' } },
    );
  });

  it('should clean leading slashes from path', async () => {
    mockedHttpClient.mockResolvedValueOnce({ raw: 'data' });

    await client.get('/owner/repo');

    expect(mockedHttpClient).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo',
      expect.any(Object),
    );
  });

  it('should throw RateLimitError on 403 rate limit message', async () => {
    mockedHttpClient.mockRejectedValueOnce(
      new AppError(HttpStatus.FORBIDDEN, 'API rate limit exceeded'),
    );

    await expect(client.get('owner/repo')).rejects.toMatchObject({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: expect.any(String),
    });
  });
});
