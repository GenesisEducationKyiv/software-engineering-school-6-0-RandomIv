import { test, expect } from '@playwright/test';
import {
  clearEmails,
  waitForEmail,
  extractConfirmToken,
  extractUnsubscribeToken,
} from './mailhog.helper';

const TEST_REPO = 'facebook/react';

test.beforeEach(async ({ request }) => {
  await clearEmails(request);
});

test('subscription confirm and unsubscribe flow', async ({ page, request }) => {
  const email = `user-${Date.now()}@example.com`;

  await page.goto('/');
  await page.fill('#email', email);
  await page.fill('#repo', TEST_REPO);
  await page.click('#submit-btn');

  const message = page.locator('#message');
  await expect(message).toBeVisible({ timeout: 15_000 });
  await expect(message).toHaveClass(/success/);

  const body = await waitForEmail(request, email);
  const confirmToken = extractConfirmToken(body);

  await page.goto(`/web/confirm/${confirmToken}`);
  await expect(page.getByRole('heading', { name: 'Confirmed' })).toBeVisible();
  await expect(
    page.getByText('Your subscription has been confirmed successfully.'),
  ).toBeVisible();

  const unsubscribeToken = extractUnsubscribeToken(body);
  await page.goto(`/web/unsubscribe/${unsubscribeToken}`);
  await expect(
    page.getByRole('heading', { name: 'Unsubscribed' }),
  ).toBeVisible();
  await expect(
    page.getByText('You have been successfully unsubscribed.'),
  ).toBeVisible();
});
