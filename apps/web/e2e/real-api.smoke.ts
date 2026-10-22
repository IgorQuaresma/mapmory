// Ad-hoc smoke script against the real API (not part of the mock-mode e2e suite).
import { chromium } from '@playwright/test';

const out = process.argv[2]!;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
await page.goto('http://localhost:5173/');
await page.screenshot({ path: `${out}/1-landing.png` });
await page.goto('http://localhost:5173/create');
await page.getByTestId('memory-input').fill('Wir haben uns am 3. Mai 2015 am Aasee in Münster verlobt.');
const box = page.locator('altcha-widget input[type=checkbox]');
if (await box.count()) {
  await box.first().click({ force: true });
  await page.waitForFunction(() => (document.querySelector("altcha-widget input[type=checkbox]") as HTMLInputElement | null)?.checked === true, undefined, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('altcha-widget')?.getAttribute('data-state') === 'verified' || !!document.querySelector('altcha-widget [data-state="verified"]'), undefined, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${out}/2-create.png` });
await page.getByTestId('interpret-submit').click();
await page.waitForURL(/\/create\/place$/, { timeout: 20000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/3-place.png` });
await page.getByTestId('create-design').click();
await page.waitForURL(/\/design\/[0-9a-f-]+$/, { timeout: 20000 });
await page.waitForSelector('.maplibregl-canvas');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/4-editor.png` });
await browser.close();
