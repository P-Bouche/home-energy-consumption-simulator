import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite dev server for the web app. `/api/*` is proxied to the NestJS API.
 *
 * Ports are env-driven so parallel agent worktrees can run side by side
 * (see docs/agents/parallel-worktrees.md): `WEB_PORT` is this dev server
 * (default 5173), `API_PORT` is the proxy target (default 3000).
 * `strictPort` makes a port collision fail loudly instead of silently
 * incrementing the port.
 */
const webPort = Number(process.env['WEB_PORT'] ?? 5173);
const apiPort = Number(process.env['API_PORT'] ?? 3000);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
