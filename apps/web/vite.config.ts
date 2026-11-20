import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite dev server for the web app. `/api/*` is proxied to the NestJS API on
 * localhost:3000 (the API also enables CORS for this origin).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
