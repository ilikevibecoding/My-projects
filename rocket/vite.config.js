import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset URLs — dist must work from any CDN subpath
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
  },
});
