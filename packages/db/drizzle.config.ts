import { defineConfig } from 'drizzle-kit';

import { loadEnvFiles } from './src/load-env';
import { resolveDatabaseConfig } from './src/env';

loadEnvFiles();

/**
 * Drizzle Kit configuration — same shape as the official Turso Cloud guide:
 * https://orm.drizzle.team/docs/get-started/turso-new
 *
 *   dialect: 'turso'  → Turso Cloud (the application's database)
 *   dialect: 'sqlite' → an explicit `file:` URL, used by the automated tests
 *
 * All schema changes go through Drizzle Kit:
 *   pnpm db:generate   drizzle-kit generate
 *   pnpm db:migrate    drizzle-kit migrate
 *   pnpm db:push       drizzle-kit push
 *   pnpm db:studio     drizzle-kit studio
 */
const { url, authToken, target } = resolveDatabaseConfig();

export default defineConfig(
  target === 'turso'
    ? {
        schema: './src/schema.ts',
        out: './migrations',
        dialect: 'turso',
        dbCredentials: { url, authToken: authToken ?? '' },
        casing: 'snake_case',
        verbose: true,
        strict: true,
      }
    : {
        schema: './src/schema.ts',
        out: './migrations',
        dialect: 'sqlite',
        dbCredentials: { url },
        casing: 'snake_case',
        verbose: true,
        strict: true,
      },
);
