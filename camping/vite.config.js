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
    // Inline the foliage atlas into the bundle. The whole point of the CDN
    // build is that a single <script> tag works on any page; if the atlas were
    // emitted as a separate file the JS would resolve it relative to whoever
    // is hosting the page and the trees would silently lose their needles.
    assetsInlineLimit: 8 * 1024 * 1024,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/camping-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
