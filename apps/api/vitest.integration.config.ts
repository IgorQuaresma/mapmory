import { defineConfig } from 'vitest/config';

// Starts Postgres + Redis with Testcontainers (Docker required).
export default defineConfig({
  test: { include: ['test/integration/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false },
});
