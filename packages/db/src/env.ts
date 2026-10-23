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
 * Normalise a pasted connection URL.
 *
 * Chat apps and rich-text editors add noise that looks harmless but produces a
 * host Turso rejects: markdown links, smart quotes, angle brackets, trailing
 * slashes, zero-width characters. Anything that survives cleaning but is still
 * not a valid URL is rejected here with a readable message.
 */
export function normalizeDatabaseUrl(raw: string): { url: string; repaired: boolean } {
  let value = raw.trim();
  let repaired = false;

  // Markdown link: [label](https://host) or [https://host](https://host)
  const markdown = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
  if (markdown) {
    const label = markdown[1]?.trim() ?? '';
    const target = markdown[2]?.trim() ?? '';
    value = /^(libsql|https?|wss?):\/\//i.test(label) ? label : target;
    repaired = true;
  }

  // Strip wrapping quotes / backticks / angle brackets.
  const unwrapped = value.replace(/^[`'"<\[]+/, '').replace(/[`'">\]]+$/, '');
  if (unwrapped !== value) {
    value = unwrapped;
    repaired = true;
  }

  // Remove invisible characters (zero-width space/joiners, NBSP, BOM).
  const cleaned = value.replace(/[\u200b-\u200d\u2060\ufeff\u00a0]/g, '');
  if (cleaned !== value) {
    value = cleaned;
    repaired = true;
  }

  // Trailing slashes are meaningless on both libsql:// and file: URLs.
  const trimmedSlashes = value.replace(/\/+$/, '');
  if (trimmedSlashes !== value) {
    value = trimmedSlashes;
    repaired = true;
  }

  if (/\s/.test(value)) {
    throw new Error(
      `TURSO_DATABASE_URL contains whitespace: ${JSON.stringify(raw)}. It must be a single URL such as libsql://<db>-<org>.turso.io`,
    );
  }

  if (!/^(libsql|https?|wss?):\/\/|^file:/.test(value)) {
    throw new Error(
      `TURSO_DATABASE_URL must start with libsql://, https:// or file:. Received ${JSON.stringify(raw)}.`,
    );
  }

  if (/^[a-z]+:\/\//i.test(value)) {
    try {
      // eslint-disable-next-line no-new
      new URL(value);
    } catch {
      throw new Error(
        `TURSO_DATABASE_URL is not a valid URL: ${JSON.stringify(raw)}. Expected libsql://<db>-<org>.turso.io`,
      );
    }
  }

  return { url: value, repaired };
}

/** Tokens are pasted with quotes and line breaks surprisingly often. */
export function normalizeAuthToken(raw: string): string {
  return (
    raw
      .trim()
      .replace(/^[`'"\s]+/, '')
      .replace(/[`'"\s]+$/, '')
      .replace(/[\u200b-\u200d\u2060\ufeff\u00a0]/g, '')
      // Pasted from docs: the client adds the scheme itself, so a stray prefix breaks auth.
      .replace(/^bearer\s+/i, '')
  );
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
  const rawUrlInput = (env.TURSO_DATABASE_URL ?? env.DATABASE_URL)?.trim();

  if (!rawUrlInput) {
    throw new Error(
      [
        'TURSO_DATABASE_URL is not set.',
        '',
        'Create a Turso Cloud database and configure it:',
        '  turso db create quizplatform',
        '  turso db show quizplatform --url       # libsql://<db>-<org>.turso.io',
        '  turso db tokens create quizplatform    # TURSO_AUTH_TOKEN',
        '',
        'Then put both values in .env and run: bun run db:migrate && bun run db:seed',
      ].join('\n'),
    );
  }

  const { url: rawUrl, repaired } = normalizeDatabaseUrl(rawUrlInput);

  if (repaired) {
    console.warn(`[db] cleaned up TURSO_DATABASE_URL → ${redactUrl(rawUrl)}`);
  }

  const target: DatabaseTarget = looksRemote(rawUrl) ? 'turso' : 'file';
  const rawToken = env.TURSO_AUTH_TOKEN;
  const authToken = rawToken ? normalizeAuthToken(rawToken) : undefined;

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
