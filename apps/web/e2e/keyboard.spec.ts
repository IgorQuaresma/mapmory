import { expect, test } from '@playwright/test';
import { MEMORY, tabTo } from './helpers';

test('keyboard-only: create a poster, pan the map, change a theme, undo', async ({ page }) => {
  await page.goto('/');
  await tabTo(page, page.getByTestId('cta-create'));
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await tabTo(page, page.getByTestId('memory-input'));
  await page.keyboard.type(MEMORY);
  await tabTo(page, page.getByTestId('interpret-submit'));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/create\/place$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await tabTo(page, page.getByTestId('create-design'), 120);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/design\//);
  await page.waitForSelector('.maplibregl-canvas');
  const marker = page.getByTestId('marker-m1');
  await expect(marker).toBeVisible();

  // Pan with the arrow keys on the focused map; the geo-anchored marker moves on screen.
  const canvas = page.locator('.maplibregl-canvas');
  await tabTo(page, canvas, 200);
  const before = await marker.boundingBox();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await marker.boundingBox())!.x).toBeLessThan(before!.x - 5);

  // Choose a theme with the keyboard, then undo with Ctrl+Z.
  await tabTo(page, page.getByTestId('theme-gold-ink'), 200);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('theme-gold-ink')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('theme-blush')).toHaveAttribute('aria-checked', 'true');

  // Undo/redo buttons are reachable too.
  await tabTo(page, page.getByTestId('redo'), 200);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('theme-gold-ink')).toHaveAttribute('aria-checked', 'true');
});
