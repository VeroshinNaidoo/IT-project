import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  plugins: [
    react(),
    {
      name: 'eduquest-health',
      configureServer(server) {
        server.middlewares.use('/health', (_request, response) => {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/plain');
          response.end('ok');
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT || 5173),
    allowedHosts: ['localhost', '127.0.0.1'],
    proxy: { '/api': `http://127.0.0.1:${process.env.BACKEND_PORT || 4000}` },
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.VITE_PORT || 5173),
    proxy: { '/api': `http://127.0.0.1:${process.env.BACKEND_PORT || 4000}` },
  },
});
