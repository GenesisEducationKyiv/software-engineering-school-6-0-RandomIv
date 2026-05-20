import { test, expect } from '@playwright/test';
import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const databaseUrl =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5434/github_notifier';
let prisma: PrismaClient;

test.beforeAll(async () => {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

test.afterAll(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});
test.beforeEach(async () => {
  await prisma.subscription.deleteMany();
  await prisma.repository.deleteMany();
});
test('subscription confirm and unsubscribe flow', async ({ request, page }) => {
  const email = `user-${Date.now()}@example.com`;
  const repo = 'facebook/react';
  const subscribeResponse = await request.post('/web/subscribe', {
    data: {
      email,
      repo,
    },
  });
  expect(subscribeResponse.status()).toBe(200);
  const subscription = await prisma.subscription.findFirst({
    where: { email },
  });
  expect(subscription).not.toBeNull();
  if (!subscription) {
    throw new Error('Subscription was not created');
  }
  await page.goto(`/web/confirm/${subscription.confirmationToken}`);
  await expect(page.getByRole('heading', { name: 'Confirmed' })).toBeVisible();
  await expect(
    page.getByText('Your subscription has been confirmed successfully.'),
  ).toBeVisible();
  await page.goto(`/web/unsubscribe/${subscription.unsubscribeToken}`);
  await expect(
    page.getByRole('heading', { name: 'Unsubscribed' }),
  ).toBeVisible();
  await expect(
    page.getByText('You have been successfully unsubscribed.'),
  ).toBeVisible();
});
