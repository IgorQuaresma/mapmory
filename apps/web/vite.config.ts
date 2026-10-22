import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 1200 },
});
