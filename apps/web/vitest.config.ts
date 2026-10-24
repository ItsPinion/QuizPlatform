import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `tsconfig.json` sets `"jsx": "preserve"` for Next's benefit, and the test
  // transformer inherits that unless it is told otherwise. JSX is only reached by
  // the one component test that needs a DOM, so this is scoped rather than a
  // second build pipeline.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    // The same `@/` alias `tsconfig.json` declares; the test runner does not read
    // TypeScript paths on its own.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
