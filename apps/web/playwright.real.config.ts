import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end against the REAL stack: Vite (proxying /api) → API → Postgres/Redis/S3/Mailpit/Martin → render worker.
 * Start the services first (`pnpm infra:up`, API and worker); CI does this in the `e2e-real` job.
 */
export default defineConfig({
  testDir: './e2e-real',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
