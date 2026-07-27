import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin is desktop-first. Fixed dev port so the client/server URLs stay stable.
// In production Caddy serves the admin under /admin/ (handle_path strips the prefix),
// so built asset URLs must be /admin/-relative; local dev stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin/' : '/',
  plugins: [react()],
  server: { port: 5175, strictPort: true },
}));
