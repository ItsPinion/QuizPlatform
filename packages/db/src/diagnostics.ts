import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ResolvedDatabaseConfig } from './env';
import { redactUrl } from './env';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_PACKAGE_DIR = path.resolve(HERE, '..');

export type FailureKind =
  'schema-missing' | 'rejected' | 'auth' | 'network' | 'not-configured' | 'unknown';

export interface Diagnosis {
  kind: FailureKind;
  title: string;
  reason: string;
  hints: string[];
  httpStatus?: number;
  rawBody?: string;
}

/** Flatten Drizzle's wrapped driver error into `a → b → c`. */
export function describeErrorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    const candidate = current.message.split('\n')[0]?.trim();
    if (candidate && !parts.includes(candidate)) parts.push(candidate);

    const cause = (current as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && candidate === 'fetch failed') {
      const code = (cause as { code?: unknown }).code;
      if (code) parts.push(String(code));
    }

    current = cause;
  }

  if (parts.length === 0 && typeof error === 'string') parts.push(error);
  return parts.join(' → ') || 'Unknown database error';
}

/** Walk the cause chain looking for an HTTP status on the driver error. */
export function findHttpStatus(error: unknown): number | undefined {
  let current: unknown = error;

  while (current && typeof current === 'object') {
    const status = (current as { status?: unknown }).status;
    if (typeof status === 'number') return status;

    const message = (current as { message?: unknown }).message;
    if (typeof message === 'string') {
      const match = /http status ([0-9]{3})/i.exec(message);
      if (match) return Number(match[1]);
    }

    current = (current as { cause?: unknown }).cause;
  }

  return undefined;
}

/** Turn any driver error into an actionable diagnosis. */
export function diagnoseDatabaseError(error: unknown): Diagnosis {
  const reason = describeErrorChain(error);
  const lower = reason.toLowerCase();
  const httpStatus = findHttpStatus(error);

  if (/no such table|no such column/.test(lower)) {
    return {
      kind: 'schema-missing',
      title: 'The database is reachable but has no schema yet.',
      reason,
      hints: [
        'Apply the Drizzle migrations:  bun run db:migrate',
        'Then load demo data:          bun run db:seed',
        'Note: `bun run db:generate` writes SQL files, it does not touch the database.',
      ],
      ...(httpStatus ? { httpStatus } : {}),
    };
  }

  if (httpStatus === 400 || /server returned http status 400/.test(lower)) {
    return {
      kind: 'rejected',
      title: 'Turso accepted the connection but rejected the query (HTTP 400).',
      reason,
      hints: [
        'This is not a schema or network problem — the request reached Turso.',
        'Most common cause: the token does not belong to this database.',
        '  turso db show <db> --url       → compare with TURSO_DATABASE_URL',
        '  turso db tokens create <db>    → issue a fresh token for THAT database',
        'Also check the database was not deleted or archived:  turso db list',
        'If the URL was pasted from a chat or issue, retype it — stray brackets or',
        'invisible characters produce exactly this kind of rejection.',
      ],
      httpStatus: 400,
    };
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /unauthori[sz]ed|forbidden|invalid token/.test(lower)
  ) {
    return {
      kind: 'auth',
      title: 'Turso rejected the credentials.',
      reason,
      hints: [
        'Issue a new token:  turso db tokens create <db>',
        'Make sure it is TURSO_AUTH_TOKEN in .env, with no extra quotes or spaces.',
      ],
      ...(httpStatus ? { httpStatus } : {}),
    };
  }

  if (/fetch failed|econnreset|enotfound|etimedout|econnrefused|socket|network/.test(lower)) {
    return {
      kind: 'network',
      title: 'The database could not be reached from this machine.',
      reason,
      hints: [
        'Turso needs HTTPS to *.turso.io on port 443.',
        'Corporate proxies, VPNs and sandboxed CI networks commonly block it.',
        'Verify with:  curl -sS -o /dev/null -w "%{http_code}" https://<db>.turso.io/health',
      ],
    };
  }

  return {
    kind: 'unknown',
    title: 'The database operation failed.',
    reason,
    hints: ['Re-run with DEBUG=1 to see the full driver error.'],
    ...(httpStatus ? { httpStatus } : {}),
  };
}

/** Copy-pasteable request that shows Turso's raw answer. */
export function rawProbeCommand(config: ResolvedDatabaseConfig): string {
  if (config.target !== 'turso') {
    return `# local file target: ${config.urlHint}`;
  }

  const host = redactUrl(config.url)
    .replace(/^libsql:\/\//, 'https://')
    .replace(/\/$/, '');

  return [
    `curl -sS -i -X POST '${host}/v2/pipeline' \\`,
    `  -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d '{"requests":[{"type":"execute","stmt":{"sql":"select 1"}},{"type":"close"}]}'`,
  ].join('\n');
}

export function formatDiagnosis(diagnosis: Diagnosis, config?: ResolvedDatabaseConfig): string {
  const lines = ['', `✖ ${diagnosis.title}`, '', `  reason: ${diagnosis.reason}`, ''];

  if (config) lines.push(`  target: ${config.urlHint} [${config.target}]`, '');

  for (const hint of diagnosis.hints) lines.push(`  • ${hint}`);

  if (diagnosis.rawBody) {
    lines.push('', '  Raw response from Turso:', '', `  ${diagnosis.rawBody}`);
  }

  if (config) {
    lines.push('', '  See Turso’s raw response with:', '', rawProbeCommand(config));
  }

  lines.push('');
  return lines.join('\n');
}

interface ProbeResult {
  ok: boolean;
  error?: string;
  httpStatus?: number;
  body?: string;
  code?: string;
}

/** Maps a libsql/https URL to the HTTP endpoint the raw-body probe should hit. */
/** Fetches Turso's own rejection body so the real reason is visible. */
export async function fetchRawResponse(
  config: ResolvedDatabaseConfig,
): Promise<string | undefined> {
  const endpoint = toHttpEndpoint(config.url);
  if (!endpoint) return undefined;
  try {
    const res = await fetch(endpoint + '/v2/pipeline', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.authToken ? { authorization: 'Bearer ' + config.authToken } : {}),
      },
      body: JSON.stringify({
        requests: [{ type: 'execute', stmt: { sql: 'select 1' } }, { type: 'close' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = (await res.text()).slice(0, 600);
    return `HTTP ${res.status} ${text}`;
  } catch (error) {
    return `probe failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function toHttpEndpoint(url: string): string | undefined {
  if (!/^(libsql|https?):\/\//i.test(url)) return undefined;
  return url.replace(/^libsql:\/\//i, 'https://').replace(/\/+$/, '');
}

/**
 * Runs `select 1` in a child process.
 *
 * Executed out-of-process because this is used from `drizzle.config.ts`, which
 * drizzle-kit loads synchronously — a top-level await there would break the CLI.
 */
export function runConnectionProbe(
  config: ResolvedDatabaseConfig,
  timeoutMs = 20_000,
): ProbeResult {
  const script = `
import { writeSync } from 'node:fs';
import { createClient } from '@libsql/client';

const url = process.env.__PROBE_URL;
const authToken = process.env.__PROBE_TOKEN || undefined;

// Synchronous write + explicit exit: an idle libsql socket would otherwise keep
// the child alive and spawnSync would block until its timeout.
const emit = (payload) => {
  writeSync(1, '__PROBE__' + JSON.stringify(payload));
  process.exit(0);
};

setTimeout(() => emit({ ok: false, error: 'probe timed out' }), 15000).unref();

try {
  const client = createClient({ url, ...(authToken ? { authToken } : {}) });
  const result = await client.execute('select 1 as ok');
  emit({ ok: result.rows.length === 1 });
  await client.close();
} catch (error) {
  let httpStatus;
  let current = error;
  while (current && typeof current === 'object') {
    if (typeof current.status === 'number') { httpStatus = current.status; break; }
    const match = String(current.message || '').match(/HTTP status ([0-9]{3})/);
    if (match) { httpStatus = Number(match[1]); break; }
    current = current.cause;
  }

  const probeUrl = process.env.__PROBE_HTTP_URL;
  let body;
  if (httpStatus && probeUrl) {
    try {
      const host = probeUrl;
      const res = await fetch(host + '/v2/pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authToken ? { authorization: 'Bearer ' + authToken } : {}) },
        body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql: 'select 1' } }, { type: 'close' }] }),
      });
      body = (await res.text()).slice(0, 600);
    } catch {
      // raw probe is best effort
    }
  }

  emit({
    ok: false,
    error: String(error && error.message ? error.message : error),
    ...(httpStatus ? { httpStatus } : {}),
    ...(body ? { body } : {}),
  });
}
`;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: DB_PACKAGE_DIR,
    env: {
      ...process.env,
      __PROBE_URL: config.url,
      __PROBE_TOKEN: config.authToken ?? '',
      __PROBE_HTTP_URL: toHttpEndpoint(config.url) ?? '',
    },
    encoding: 'utf8',
    timeout: timeoutMs,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const marker = output.indexOf('__PROBE__');

  if (marker === -1) {
    return {
      ok: false,
      error: output.split('\n')[0] || 'Connection probe did not return a result',
    };
  }

  try {
    return JSON.parse(output.slice(marker + '__PROBE__'.length)) as ProbeResult;
  } catch {
    return { ok: false, error: 'Connection probe returned malformed output' };
  }
}
