import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  plugins: [react()],
  server: {
    allowedHosts: ['.loca.lt', '.lhr.life'],
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
});
