import { defineConfig } from 'tsup';

// Workspace packages are bundled; third-party dependencies stay external and come from `pnpm deploy`.
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@mapmory\//],
});
