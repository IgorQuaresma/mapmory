import { defineConfig } from 'vitest/config';

// Needs Martin (tiles + glyphs), Chromium and poppler; see README "Renderer tests".
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false } });
