import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static bundle loaded by headless Chromium in the render worker (plan §7.2 step 5).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', assetsInlineLimit: 0, sourcemap: false },
});
