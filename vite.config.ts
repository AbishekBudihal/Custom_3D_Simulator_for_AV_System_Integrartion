import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020'
  },
  test: {
    environment: 'node'
  }
});
