import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build works when served from a subpath like /spaceship/
  base: './',
});
