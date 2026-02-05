import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    // Set environment variables before tests run
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-for-testing-minimum-32-chars',
      CORS_ORIGIN: 'http://localhost:5173',
    },
  },
  resolve: {
    alias: {
      '@teamchat/shared': './packages/shared/src/index.ts',
    },
  },
});
