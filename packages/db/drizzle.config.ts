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
 * `generate` only diffs the TypeScript schema and needs no connection, so it
 * works without credentials. Every command that talks to the database
 * (migrate / push / studio / pull) requires real Turso credentials.
 */
const COMMANDS = [
  'generate',
  'migrate',
  'push',
  'pull',
  'studio',
  'check',
  'up',
  'introspect',
  'export',
  'drop',
];
const COMMANDS_WITHOUT_CONNECTION = new Set(['generate', 'check', 'up']);

/** drizzle-kit is invoked as `drizzle-kit <command>`; argv[0..1] are runtime + bin. */
const command = process.argv.slice(1).find((arg) => COMMANDS.includes(arg));
const needsConnection = !COMMANDS_WITHOUT_CONNECTION.has(command ?? '');

function credentials() {
  if (needsConnection) {
    return resolveDatabaseConfig();
  }

  try {
    return resolveDatabaseConfig();
  } catch {
    // Schema-only command on a machine without credentials: drizzle-kit will
    // never open this URL while generating migrations.
    return { url: 'file:./.data/schema-only.db', target: 'file' as const, urlHint: 'schema only' };
  }
}

const { url, authToken, target } = credentials();

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
