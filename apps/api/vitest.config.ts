import { defineConfig } from 'vitest/config';

import { TEST_DB_URL } from './src/__tests__/test-db';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./src/__tests__/global-setup.ts'],
    // Applied before any app module is imported, so the db layer resolves here.
    env: {
      NODE_ENV: 'test',
      TURSO_DATABASE_URL: TEST_DB_URL,
      TURSO_AUTH_TOKEN: '',
      WEB_ORIGIN: 'http://localhost:3000',
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
