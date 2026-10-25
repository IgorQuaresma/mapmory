import { expect, test } from '@playwright/test';
import { MEMORY, createPoster, expectAccessible } from './helpers';

test('memory → place → editor → customize → undo/redo → export → download', async ({ page }) => {
  await page.goto('/');
  await expectAccessible(page, 'landing');
  await page.getByTestId('cta-create').click();

  // Step 1
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.getByTestId('memory-input').fill(MEMORY);
  await expectAccessible(page, 'step 1');
  await page.getByTestId('interpret-submit').click();

  // Step 2: the interpreted place, title and date are pre-filled.
  await expect(page).toHaveURL(/\/create\/place$/);
  await expect(page.getByTestId('chosen-places')).toContainText('Pont des Arts');
  await expect(page.getByTestId('title-input')).toHaveValue('Where it all began');
  await page.waitForSelector('.maplibregl-canvas');
  await expectAccessible(page, 'step 2');
  await page.getByTestId('title-input').fill('Our forever starts here');
  await page.getByTestId('create-design').click();

  // Editor
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]+$/);
  const title = page.getByTestId('text-title');
  await expect(title).toHaveText('Our forever starts here');
  await page.waitForSelector('.maplibregl-canvas');
  await expectAccessible(page, 'editor');

  // Theme
  await page.getByTestId('theme-night-train').click();
  await expect(page.getByTestId('theme-night-train')).toHaveAttribute('aria-checked', 'true');
  await expect(title).toHaveCSS('color', 'rgb(255, 231, 163)');

  // Colour via hex input
  await page.getByLabel('Land', { exact: true }).fill('#123456');
  await expect(page.getByLabel('Land', { exact: true })).toHaveValue('#123456');

  // Text (Night Train sets titles in capitals, so compare case-insensitively)
  await page.getByRole('tab', { name: 'Text' }).click();
  await page.getByTestId('text-input-title').fill('Forever');
  await page.getByTestId('text-input-title').blur();
  await expect(title).toHaveText(/^forever$/i);

  // Undo / redo (title edit is one entry, colour another, theme another)
  await page.getByTestId('undo').click();
  await expect(title).toHaveText(/^our forever starts here$/i);
  await page.getByTestId('redo').click();
  await expect(title).toHaveText(/^forever$/i);
  await page.getByTestId('undo').click();
  await page.getByTestId('undo').click();
  await page.getByTestId('undo').click();
  await expect(title).toHaveCSS('color', 'rgb(122, 46, 59)'); // back to Blush
  await page.getByTestId('redo').click();
  await page.getByTestId('redo').click();
  await page.getByTestId('redo').click();
  await expect(title).toHaveText(/^forever$/i);

  // Autosave
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  // Export (requires a verified email: magic link inline)
  await page.getByTestId('go-export').click();
  await expect(page).toHaveURL(/\/export$/);
  await expect(page.getByTestId('pixel-size')).toContainText('3,579 × 5,031 px'); // A3 + 3 mm bleed (303 × 426 mm) @ 300 DPI
  await expectAccessible(page, 'export');
  await page.getByLabel('Email address').fill('ana@example.com');
  await page.getByRole('button', { name: 'Send me a link' }).click();
  await expect(page.getByTestId('check-email')).toBeVisible();
  await page.getByRole('radio', { name: /PNG/ }).check();
  await expect(page.getByTestId('start-export')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('start-export').click();
  await expect(page.getByTestId('export-status')).toHaveAttribute('data-status', 'done', { timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-link').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('mapmory-poster.png');
});

test('editor changes survive a reload (autosave + server revision)', async ({ page }) => {
  await createPoster(page);
  await page.getByRole('tab', { name: 'Text' }).click();
  await page.getByTestId('text-input-title').fill('Saved title');
  await page.getByTestId('text-input-title').blur();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId('text-title')).toHaveText('Saved title');
});

test('manual path when the place is not found', async ({ page }) => {
  await page.goto('/create');
  await page.getByTestId('memory-input').fill('A quiet evening somewhere I cannot name.');
  await page.getByTestId('interpret-submit').click();
  await expect(page.getByText("We couldn't find that place")).toBeVisible();
  await page.getByRole('combobox', { name: 'Search for a place' }).fill('Brooklyn');
  await page.getByRole('option', { name: /Brooklyn Bridge/ }).click();
  await expect(page.getByTestId('chosen-places')).toContainText('Brooklyn Bridge');
  await page.getByTestId('create-design').click();
  // The mock heuristic still suggests a title from the mood; the map uses the chosen place.
  await expect(page.getByTestId('text-title')).toHaveText(/^our quiet place$/i); // "quiet" → calm mood
  await expect(page.getByTestId('text-subtitle')).toHaveText(/NEW YORK/i);
});

test('German UI', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('de');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Deine Erinnerung');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
