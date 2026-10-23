import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Repo root, resolved from this file's location:
 *   <root>/packages/db/src/env.ts  ->  <root>
 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const LOCAL_DB_PATH = path.join(REPO_ROOT, '.data', 'quizplatform.db');
export const LOCAL_DB_URL = `file:${LOCAL_DB_PATH}`;

export type DatabaseTarget = 'turso' | 'local-file' | 'unknown';

export interface ResolvedDatabaseConfig {
  url: string;
  authToken?: string;
  target: DatabaseTarget;
  /** Safe, credential-free description for logs and the health endpoint. */
  urlHint: string;
  isFallback: boolean;
}

function looksRemote(url: string): boolean {
  return /^(libsql|https?|wss?):\/\//i.test(url);
}

/**
 * Resolve the database connection from the environment.
 *
 * - `DATABASE_URL` may be a Turso URL (`libsql://…`) or a local `file:` URL.
 * - `TURSO_AUTH_TOKEN` is required for remote Turso databases.
 * - With no `DATABASE_URL`, development falls back to a local SQLite file so the
 *   app boots before Turso credentials are configured.
 */
export function resolveDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDatabaseConfig {
  const rawUrl = env.DATABASE_URL?.trim();

  if (rawUrl) {
    const target: DatabaseTarget = looksRemote(rawUrl) ? 'turso' : 'local-file';
    return {
      url: rawUrl,
      ...(env.TURSO_AUTH_TOKEN?.trim() ? { authToken: env.TURSO_AUTH_TOKEN.trim() } : {}),
      target,
      urlHint: target === 'turso' ? redactUrl(rawUrl) : path.basename(rawUrl),
      isFallback: false,
    };
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required in production (Turso libsql:// URL).');
  }

  return {
    url: LOCAL_DB_URL,
    target: 'local-file',
    urlHint: '.data/quizplatform.db (local fallback)',
    isFallback: true,
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
