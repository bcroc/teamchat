import { beforeAll, afterAll } from 'vitest';

// Set test environment variables (also set in vitest.config.ts env)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-minimum-32-chars';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://teamchat:teamchat_dev_password@localhost:5432/teamchat_test';

// Clean up after all tests
afterAll(async () => {
  // Allow time for connections to close
  await new Promise((resolve) => setTimeout(resolve, 100));
});
