import { z } from 'zod';

export const githubReleaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string().url(),
});

export type GitHubReleaseResponse = z.infer<typeof githubReleaseSchema>;
