import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In development the API runs separately on :3000; same-origin /api keeps cookies simple.
  server: { proxy: { '/api': 'http://localhost:3000' } },
  // `vite preview` serves the built app (port 4173). It may be shared for review through a
  // temporary Cloudflare quick tunnel (*.trycloudflare.com), so that host is allowed here.
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
    allowedHosts: ['.trycloudflare.com'],
  },
});
