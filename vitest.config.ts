import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    isolate: true,
    testTimeout: 15000,
    setupFiles: ['./src/lib/client/__tests__/setup.ts'],
    environmentMatchGlobs: [
      ['**/src/lib/client/**', 'jsdom'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
