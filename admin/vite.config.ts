import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin is desktop-first. Fixed dev port so the client/server URLs stay stable.
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
});
