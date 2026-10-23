import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure client-side helpers only: no DOM needed, so no jsdom dependency.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
