import { expect, test } from '@playwright/test';
import { createPoster, expectAccessible } from './helpers';

test('shares a watermarked read-only preview and revokes it', async ({ page }) => {
  await createPoster(page);
  await page.getByTestId('share-open').click();
  await page.getByTestId('share-create').click();
  const url = await page.getByTestId('share-url').inputValue();
  expect(url).toMatch(/\/s\/[0-9a-f]{32}$/);
  await expectAccessible(page, 'share dialog');

  // The mock keeps its data in sessionStorage, so open the preview in the same tab.
  await page.goto(url);
  await expect(page.getByTestId('shared-poster')).toBeVisible();
  await expect(page.getByTestId('watermark')).toBeVisible();
  await expect(page.getByTestId('text-title')).toContainText('Where it all began');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByTestId('go-export')).toHaveCount(0);
  await expectAccessible(page, 'shared preview');

  await page.goBack();
  await page.getByTestId('share-open').click();
  await page.getByTestId('share-revoke').click();
  await expect(page.getByTestId('share-dialog')).toContainText(/no longer works/);
  await page.goto(url);
  await expect(page.getByText(/expired or was turned off/)).toBeVisible();
});
