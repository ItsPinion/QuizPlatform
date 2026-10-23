import { defineConfig } from 'drizzle-kit';

import { loadEnvFiles } from './src/load-env';
import { resolveDatabaseConfig } from './src/env';

loadEnvFiles();

const { url, authToken, target } = resolveDatabaseConfig();

/**
 * One config drives both targets:
 *   - `libsql://…`  -> Turso (dialect `turso`, requires TURSO_AUTH_TOKEN)
 *   - `file:…`      -> local SQLite file used for offline development
 */
export default defineConfig(
  target === 'turso'
    ? {
        schema: './src/schema.ts',
        out: './migrations',
        dialect: 'turso',
        dbCredentials: { url, authToken: authToken ?? '' },
        strict: true,
        verbose: true,
      }
    : {
        schema: './src/schema.ts',
        out: './migrations',
        dialect: 'sqlite',
        dbCredentials: { url },
        strict: true,
        verbose: true,
      },
);
