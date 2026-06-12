import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths: build runs from any subpath/CDN
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
  },
});
