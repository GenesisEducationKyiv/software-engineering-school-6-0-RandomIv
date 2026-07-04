import { HttpNotificationProvider } from '../../../../../src/modules/notification/rest/http.provider';

describe('rest/http.provider', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  const provider = new HttpNotificationProvider('http://notification:3001');

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
  });

  it('POSTs to /send-confirmation with correct body', async () => {
    await provider.sendConfirmation(
      'sub-1',
      'user@example.com',
      'owner/repo',
      'https://app.example.com/confirm/token',
      'https://app.example.com/unsubscribe/token',
    );

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect((url as URL).toString()).toBe(
      'http://notification:3001/send-confirmation',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });
  });

  it('POSTs to /send-release with correct body', async () => {
    await provider.sendRelease(
      'user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      'https://app.example.com/unsubscribe/token',
    );

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect((url as URL).toString()).toBe(
      'http://notification:3001/send-release',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      to: 'user@example.com',
      repo: 'owner/repo',
      tag: 'v2.0.0',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/token',
    });
  });

  it('propagates error when fetch fails', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network down'));

    await expect(
      provider.sendConfirmation(
        'sub-1',
        'user@example.com',
        'owner/repo',
        'https://app.example.com/confirm/token',
        'https://app.example.com/unsubscribe/token',
      ),
    ).rejects.toThrow();
  });
});
