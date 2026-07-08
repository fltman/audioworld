import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Client is the mobile PWA. `--host` (set in package.json) exposes it on the LAN
// so a phone / ngrok tunnel can reach it — required for real GPS + compass testing.
export default defineConfig({
  plugins: [react()],
  // allowedHosts: true lets the Vite dev server answer requests proxied through a
  // tunnel (e.g. *.trycloudflare.com) for real-device testing over HTTPS.
  server: { port: 5174, strictPort: true, allowedHosts: true },
});
