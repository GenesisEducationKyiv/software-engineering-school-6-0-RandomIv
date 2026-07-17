import { buildSafeRequest } from '../../../../src/core/grpc/with-unary-handler';

describe('buildSafeRequest', () => {
  it('redacts recipient and tokenized url fields', () => {
    const safe = buildSafeRequest({
      to: 'user@example.com',
      repo: 'owner/repo',
      confirmationUrl: 'https://app.example.com/confirm/secret-token',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/secret-token',
    });

    expect(safe).toEqual({
      to: '[REDACTED]',
      repo: 'owner/repo',
      confirmationUrl: '[REDACTED]',
      unsubscribeUrl: '[REDACTED]',
    });
  });

  it('keeps non-sensitive fields such as repo and tag for release requests', () => {
    const safe = buildSafeRequest({
      to: 'user@example.com',
      repo: 'owner/repo',
      tag: 'v1.2.3',
      releaseUrl: 'https://github.com/owner/repo/releases/tag/v1.2.3',
      unsubscribeUrl: 'https://app.example.com/unsubscribe/secret-token',
    });

    expect(safe).toEqual({
      to: '[REDACTED]',
      repo: 'owner/repo',
      tag: 'v1.2.3',
      releaseUrl: '[REDACTED]',
      unsubscribeUrl: '[REDACTED]',
    });
  });

  it('skips non-string fields and handles non-object input', () => {
    expect(
      buildSafeRequest({ repo: 'owner/repo', count: 3, active: true }),
    ).toEqual({ repo: 'owner/repo' });
    expect(buildSafeRequest(null)).toEqual({});
    expect(buildSafeRequest('not-an-object')).toEqual({});
  });
});
