/**
 * Connection diagnostic backed by Drizzle: `pnpm db:status`
 *
 * Reports which database the configuration resolves to, verifies the
 * connection with a Drizzle query, and counts rows through the schema.
 */
import { count, eq } from 'drizzle-orm';

import { resolveDatabaseConfig } from './env';
import { loadEnvFiles } from './load-env';
import { db, schema } from './index';

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
  console.log('');

  const started = performance.now();

  try {
    const [users, categories, quizzes, questions, options, attempts, answers] = await withTimeout(
      Promise.all([
        db.$count(schema.users),
        db.$count(schema.categories),
        db.$count(schema.quizzes),
        db.$count(schema.questions),
        db.$count(schema.options),
        db.$count(schema.attempts),
        db.$count(schema.answers),
      ]),
      TIMEOUT_MS,
      'Connection',
    );

    console.log(`  ✔ connected in ${Math.round(performance.now() - started)}ms`);
    console.log(
      `  rows        users ${users} · categories ${categories} · quizzes ${quizzes} · questions ${questions} · options ${options} · attempts ${attempts} · answers ${answers}`,
    );

    const [{ published } = { published: 0 }] = await db
      .select({ published: count() })
      .from(schema.quizzes)
      .where(eq(schema.quizzes.status, 'PUBLISHED'));

    console.log(`  published   ${published} quiz(zes)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✖ ${message}`);
    console.error('');

    if (/no such table/i.test(message)) {
      console.error('  Turso Cloud is reachable but the database has no schema yet.');
      console.error('  Apply the Drizzle migrations:  pnpm db:migrate');
      console.error('  Then load demo data:            pnpm db:seed');
    } else {
      console.error('  Common causes:');
      console.error('    • TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing or wrong');
      console.error('    • network egress blocked — Turso needs HTTPS to *.turso.io on port 443');
      console.error('    • database deleted or token revoked');
    }

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
