import { defineConfig } from 'drizzle-kit';

import { diagnoseDatabaseError, formatDiagnosis, runConnectionProbe } from './src/diagnostics';
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
 *
 * drizzle-kit exits silently when it cannot connect, so connection commands run
 * a preflight probe first and print an actionable diagnosis instead.
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

const config = credentials();

if (needsConnection && process.env.SKIP_DB_PREFLIGHT !== '1') {
  const probe = runConnectionProbe(config);

  if (!probe.ok) {
    const diagnosis = diagnoseDatabaseError(new Error(probe.error ?? 'Connection failed'));

    console.error(formatDiagnosis(diagnosis, config));

    if (probe.body) {
      console.error('  Raw response from Turso:');
      console.error(`  ${probe.body.replace(/\n/g, '\n  ')}`);
      console.error('');
    }

    console.error(`  ${command ?? 'command'} aborted — nothing was changed.`);
    console.error('  Set SKIP_DB_PREFLIGHT=1 to bypass this check.');
    console.error('');
    process.exit(1);
  }
}

const { url, authToken, target } = config;

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
