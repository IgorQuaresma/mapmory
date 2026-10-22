import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/worker.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/^@mapmory\//],
});
