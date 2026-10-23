/**
 * Connection diagnostic: `pnpm db:status`
 *
 * Prints which database the current configuration resolves to, then attempts a
 * lightweight query so you can tell "credentials wrong" apart from "schema not
 * applied" and "network unreachable".
 */
import { resolveDatabaseConfig } from './env';
import { loadEnvFiles } from './load-env';
import { getDatabaseClient } from './index';

loadEnvFiles();

const TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function main() {
  const config = resolveDatabaseConfig();

  console.log('');
  console.log(`  target      ${config.target}`);
  console.log(`  url         ${config.urlHint}`);
  console.log(`  auth token  ${config.authToken ? 'present' : 'not set'}`);
  console.log(`  fallback    ${config.isFallback ? 'yes (DATABASE_URL not set)' : 'no'}`);
  console.log('');

  const client = getDatabaseClient();
  const started = performance.now();

  try {
    await withTimeout(client.execute('select 1 as ok'), TIMEOUT_MS, 'Connection');
    console.log(`  ✔ connected in ${Math.round(performance.now() - started)}ms`);

    const tables = await client.execute(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    );
    const names = tables.rows.map((row) => String(row.name));

    if (!names.includes('users')) {
      console.log('  ⚠ schema not applied — run `pnpm db:migrate`');
    } else {
      const rows = await client.execute(`
        select
          (select count(*) from users)      as users,
          (select count(*) from categories) as categories,
          (select count(*) from quizzes)    as quizzes,
          (select count(*) from questions)  as questions,
          (select count(*) from attempts)   as attempts
      `);
      const row = rows.rows[0] as Record<string, unknown> | undefined;

      console.log(
        `  rows        users ${Number(row?.users ?? 0)} · categories ${Number(row?.categories ?? 0)} · quizzes ${Number(row?.quizzes ?? 0)} · questions ${Number(row?.questions ?? 0)} · attempts ${Number(row?.attempts ?? 0)}`,
      );
    }
  } catch (error) {
    console.error(`  ✖ ${error instanceof Error ? error.message : String(error)}`);
    console.error('');
    console.error('  Common causes:');
    console.error('    • DATABASE_URL / TURSO_AUTH_TOKEN missing or wrong');
    console.error('    • network egress blocked — Turso needs HTTPS to *.turso.io on port 443');
    console.error('    • database deleted or token revoked');
    process.exitCode = 1;
  }

  console.log('');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error('✖ Status check failed:', error);
    process.exit(1);
  });
