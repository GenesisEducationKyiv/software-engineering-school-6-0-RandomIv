import prisma from '../../src/core/db/db';
import { cacheService } from '../../src/core/cache/cache.service';
import { CachedGitHubClient } from '../../src/integrations/github/cached-github.client';
import { GitHubService } from '../../src/integrations/github/github.service';
import { GithubReleaseProvider } from '../../src/modules/scanner/providers/github-release.provider';
import { ScannerService } from '../../src/modules/scanner/scanner.service';
import { PrismaRepositoryRepository } from '../../src/modules/repository/repository.repository';
import type { GitHubClient } from '../../src/integrations/github/interfaces/github-client.interface';
import type { EmailService } from '../../src/integrations/email/email.service';

describe('scanner integration', () => {
  it('caches the GitHub release lookup in Redis and persists lastSeenTag', async () => {
    const repository = await prisma.repository.create({
      data: { fullName: 'owner/repo' },
    });
    await prisma.subscription.create({
      data: {
        email: 'scan-user@example.com',
        confirmed: true,
        repositoryId: repository.id,
      },
    });

    const getSpy = jest.fn().mockResolvedValue({
      tag_name: 'v2.0.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v2.0.0',
    });
    const baseClient: GitHubClient = { get: getSpy };
    const githubService = new GitHubService(
      new CachedGitHubClient(baseClient, cacheService),
    );
    const releaseProvider = new GithubReleaseProvider(githubService);
    const emailService: EmailService = {
      sendSubscriptionConfirmationEmail: jest.fn(),
      sendReleaseEmail: jest.fn().mockResolvedValue(undefined),
    };
    const repositoryRepository = new PrismaRepositoryRepository(prisma);
    const scanner = new ScannerService(
      releaseProvider,
      emailService,
      repositoryRepository,
      'https://app.example.com',
    );

    await scanner.checkReleases();

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(emailService.sendReleaseEmail).toHaveBeenCalledWith(
      'scan-user@example.com',
      'owner/repo',
      'v2.0.0',
      'https://github.com/owner/repo/releases/tag/v2.0.0',
      expect.any(String),
    );

    const updated = await prisma.repository.findUnique({
      where: { id: repository.id },
    });
    expect(updated?.lastSeenTag).toBe('v2.0.0');

    await scanner.checkReleases();

    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});
