import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Repo root, resolved from this file's location:
 *   <root>/packages/db/src/env.ts  ->  <root>
 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export type DatabaseTarget = 'turso' | 'file';

export interface ResolvedDatabaseConfig {
  url: string;
  authToken?: string;
  target: DatabaseTarget;
  /** Safe, credential-free description for logs and the health endpoint. */
  urlHint: string;
}

function looksRemote(url: string): boolean {
  return /^(libsql|https?|wss?):\/\//i.test(url);
}

/**
 * Resolve the Turso Cloud connection from the environment.
 *
 * The application always talks to Turso Cloud:
 *   TURSO_DATABASE_URL="libsql://<db>-<org>.turso.io"
 *   TURSO_AUTH_TOKEN="..."
 *
 * `DATABASE_URL` is accepted as an alias for convenience. A `file:` URL is only
 * honoured when it is passed explicitly (the automated tests do this to build a
 * throwaway database) — there is no implicit local fallback.
 *
 * Reference: https://orm.drizzle.team/docs/get-started/turso-new
 */
export function resolveDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDatabaseConfig {
  const rawUrl = (env.TURSO_DATABASE_URL ?? env.DATABASE_URL)?.trim();

  if (!rawUrl) {
    throw new Error(
      [
        'TURSO_DATABASE_URL is not set.',
        '',
        'Create a Turso Cloud database and configure it:',
        '  turso db create quizplatform',
        '  turso db show quizplatform --url       # libsql://<db>-<org>.turso.io',
        '  turso db tokens create quizplatform    # TURSO_AUTH_TOKEN',
        '',
        'Then put both values in .env and run: pnpm db:migrate && pnpm db:seed',
      ].join('\n'),
    );
  }

  const target: DatabaseTarget = looksRemote(rawUrl) ? 'turso' : 'file';
  const authToken = env.TURSO_AUTH_TOKEN?.trim();

  if (target === 'turso' && !authToken) {
    throw new Error(
      'TURSO_AUTH_TOKEN is not set. Turso Cloud requires a token: turso db tokens create quizplatform',
    );
  }

  return {
    url: rawUrl,
    ...(authToken ? { authToken } : {}),
    target,
    urlHint: target === 'turso' ? redactUrl(rawUrl) : path.basename(rawUrl),
  };
}

/** Strip query strings/credentials from a remote URL before logging it. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return '<invalid url>';
  }
}
