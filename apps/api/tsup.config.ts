import { defineConfig } from 'tsup';

/**
 * The API ships as a self-contained bundle: every dependency is compiled in, so the runtime image needs no
 * node_modules except sharp (smaller image, no dev-only packages pulled in through optional peer dependencies).
 * Optional native add-ons stay external; their packages try/catch the require and fall back to JS.
 */
export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  noExternal: [/.*/],
  // sharp is a native image library (photo re-encoding); the image installs its Alpine build next to the bundle.
  external: ['pg-native', 'msgpackr-extract', 'cpu-features', 'ssh2', 'sharp'],
  // CommonJS dependencies call require() for Node built-ins; give the ESM bundle a real require.
  banner: { js: "import { createRequire as __mmCreateRequire } from 'node:module'; const require = __mmCreateRequire(import.meta.url);" },
});
