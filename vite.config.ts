import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
