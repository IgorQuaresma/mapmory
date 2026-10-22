import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export const MEMORY = 'The night we got engaged on the Pont des Arts in Paris, 14 June 2019.';

/** Fails on serious or critical accessibility violations (WCAG 2.x A/AA rules). */
export async function expectAccessible(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`),
    `axe violations on ${context}`,
  ).toEqual([]);
}

/** Creates a poster through the wizard and returns once the editor has loaded. */
export async function createPoster(page: Page) {
  await page.goto('/create');
  await page.getByTestId('memory-input').fill(MEMORY);
  await page.getByTestId('interpret-submit').click();
  await expect(page).toHaveURL(/\/create\/place$/);
  await expect(page.getByTestId('chosen-places')).toContainText('Pont des Arts');
  await page.getByTestId('create-design').click();
  await expect(page).toHaveURL(/\/design\/[0-9a-f-]+$/);
  await expect(page.getByTestId('poster')).toBeVisible();
  await page.waitForSelector('.maplibregl-canvas');
}

/** Presses Tab until `target` has focus (keyboard-only navigation). */
export async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach the element with the keyboard');
}
