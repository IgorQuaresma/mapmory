import { expect, test } from '@playwright/test';
import { createPoster, expectAccessible } from './helpers';

test('mobile: full-screen preview with bottom-sheet panels', async ({ page }) => {
  await page.goto('/');
  await expectAccessible(page, 'landing (mobile)');
  await createPoster(page);
  const sheet = page.getByTestId('bottom-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Style' }).click();
  await expect(sheet.getByRole('tab', { name: 'Style', selected: true })).toBeVisible();
  await page.getByTestId('theme-ocean').click();
  await expect(page.getByTestId('theme-ocean')).toHaveAttribute('aria-checked', 'true');
  await expectAccessible(page, 'editor (mobile)');
  // No horizontal page scroll on phones.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
