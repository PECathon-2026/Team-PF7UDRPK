import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
  ],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/server/**', 'src/app/api/**'],
    },
    // Ensure tests run in isolation
    isolate: true,
    // Timeout per test (generous for async tests)
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});

