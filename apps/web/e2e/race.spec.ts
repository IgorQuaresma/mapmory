import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectAccessible } from './helpers';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const IRONMAN = 'Finally an Ironman! Ironman Frankfurt, swim 1:05:12, bike 5:40:12, run 4:40:03, finished in 11:42:07';

test('race poster: an Ironman memory becomes three maps, the activity fills in the routes', async ({ page }) => {
  // The race is found in the memory text in the browser and shown on the place step.
  await page.goto('/create');
  await page.getByTestId('memory-input').fill(IRONMAN);
  await page.getByTestId('interpret-submit').click();
  await expect(page).toHaveURL(/\/create\/place$/);
  await expect(page.getByTestId('chosen-places')).toContainText('Frankfurt');
  const card = page.getByTestId('race-card');
  await expect(card).toContainText('Ironman Frankfurt');
  // The event names the poster, and the mood (which only picks a memory poster's style) is not offered.
  await expect(page.getByTestId('title-input')).toHaveValue('Ironman Frankfurt');
  await expect(page.getByLabel('Mood')).toHaveCount(0);
  await expect(page.getByTestId('race-summary')).toContainText('Swim 3.8 km · Bike 180 km · Run 42.2 km');
  await expect(page.getByTestId('race-summary')).toContainText('Finish 11:42:07');
  await expect(card.getByRole('switch')).toBeChecked();
  await expect(page.getByTestId('race-time-0')).toHaveValue('1:05:12');
  await expectAccessible(page, 'place step with a race');
  await page.getByTestId('create-design').click();

  // Editor: one map per leg, the Race panel open.
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]+$/);
  for (const id of ['leg1', 'leg2', 'leg3']) await expect(page.getByTestId(`poster-panel-${id}`)).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(3);
  await expect(page.getByRole('tab', { name: 'Race' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('stats-line').first()).toContainText('3.8 km · 1:05:12');

  // Import the whole race from one multisport GPX file.
  await page.getByTestId('race-file').setInputFiles(path.join(fixtures, 'ironman.gpx'));
  await expect(page.getByTestId('race-import-message')).toContainText('Imported 3 legs');
  await expect(page.getByTestId('leg-leg1')).toContainText('Langener Waldsee swim');
  await expect(page.getByTestId('leg-leg2')).toContainText('Bike course');
  await expect(page.getByTestId('leg-leg3')).toContainText('Run along the Main');
  await expect(page.getByTestId('leg-time-leg2')).toHaveValue('5:40:12');
  await expect(page.getByTestId('stats-line')).toHaveCount(6);

  // The longest leg large, then a sport theme.
  await page.getByRole('radio', { name: 'Longest leg large' }).click();
  const swimBox = (await page.getByTestId('poster-panel-leg1').boundingBox())!;
  const bikeBox = (await page.getByTestId('poster-panel-leg2').boundingBox())!;
  expect(bikeBox.width).toBeGreaterThan(swimBox.width * 1.5);
  expect(bikeBox.y).toBeLessThan(swimBox.y);
  await page.getByRole('tab', { name: 'Style' }).click();
  await expect(page.getByTestId('theme-race-day')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('theme-finisher').click();
  await expect(page.getByTestId('theme-finisher')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });

  await page.getByRole('tab', { name: 'Race' }).click();
  await expectAccessible(page, 'race editor');

  // Undo brings back the previous theme in one step; the routes stay.
  await page.getByTestId('undo').click();
  await page.getByRole('tab', { name: 'Style' }).click();
  await expect(page.getByTestId('theme-race-day')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('stats-line')).toHaveCount(6);

  await page.getByTestId('go-export').click();
  await expect(page).toHaveURL(/\/export$/);
  // Every leg has a route and the figures fit their maps, so preflight has nothing to report.
  await expect(page.getByText('Everything looks ready for print.')).toBeVisible();
  await expect(page.getByTestId('pixel-size')).toBeVisible();
  await expectAccessible(page, 'export of a race poster');
});

test('race poster from the editor: switch a memory poster to a duathlon and back', async ({ page }) => {
  await page.goto('/create');
  await page.getByTestId('memory-input').fill('Our first trip together: sunset at the Belém Tower in Lisbon, August 2022.');
  await page.getByTestId('interpret-submit').click();
  await expect(page.getByTestId('race-add')).toBeVisible();
  await page.getByTestId('create-design').click();
  await expect(page.getByTestId('poster-map')).toBeVisible();

  await page.getByRole('tab', { name: 'Race' }).click();
  await page.getByRole('combobox', { name: 'Race type' }).click();
  await page.getByRole('option', { name: 'Duathlon' }).click();
  await page.getByTestId('race-make').click();
  await expect(page.getByTestId('poster-panel-leg3')).toBeVisible();
  await expect(page.getByTestId('race-event')).toHaveText('Duathlon');

  // A typed time shows in the stats; an invalid one is explained and not applied.
  await page.getByTestId('leg-time-leg1').fill('42:10');
  await expect(page.getByTestId('stats-line').first()).toContainText('42:10');
  await page.getByTestId('leg-time-leg1').fill('1:99');
  await expect(page.getByText('Enter a time as h:mm:ss')).toBeVisible();
  await expect(page.getByTestId('stats-line').first()).toContainText('42:10');

  await page.getByTestId('race-single').click();
  await expect(page.getByTestId('poster-map')).toBeVisible();
  await expect(page.getByTestId('poster-panel-leg1')).toHaveCount(0);
});
