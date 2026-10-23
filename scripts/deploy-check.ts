#!/usr/bin/env bun
/**
 * Deployment check (Day 14).
 *
 * Two modes, one verdict:
 *
 *   bun run deploy:check
 *       Reads the local environment (`.env.local`, `.env`, then `process.env`)
 *       and runs the same rules the API reports at `/api/admin/system`.
 *       Use it before you build an image or push to a host.
 *
 *   bun run deploy:check --url https://quiz.example.com
 *       Goes over the wire instead: liveness, readiness, hardening headers, the
 *       session guard and the error envelope — the things you can only know from
 *       outside. Combine with `--api https://api.quiz.example.com` when the API
 *       is a separate origin, and with `--admin email:password` to read the
 *       server's own self-report.
 *
 * Exit codes: 0 ready, 1 blocked (a failure), 2 could not run (bad arguments).
 * Warnings never fail the command — they are things to read, not things that
 * stop a deploy.
 */
import { evaluateEnvironment, summarizeChecks } from '@quiz/shared/deployment';
import type { CheckStatus, DeploymentCheck } from '@quiz/shared/deployment';
import { loadEnvFiles } from '@quiz/db/load-env';

interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
}

const GLYPHS: Record<CheckStatus, string> = { pass: '✓', warn: '!', fail: '×', skip: '–' };
const COLORS: Record<CheckStatus, string> = {
  pass: '\u001b[32m',
  warn: '\u001b[33m',
  fail: '\u001b[31m',
  skip: '\u001b[90m',
};
const RESET = '\u001b[0m';

function print(checks: Check[], title: string): { pass: number; warn: number; fail: number } {
  const width = Math.max(...checks.map((entry) => entry.label.length), 20);

  console.log(`\n▸ ${title}\n`);

  for (const entry of checks) {
    const color = COLORS[entry.status];
    console.log(
      `  ${color}${GLYPHS[entry.status]}${RESET} ${entry.label.padEnd(width)}  ${entry.detail}`,
    );
  }

  const pass = checks.filter((entry) => entry.status === 'pass').length;
  const warn = checks.filter((entry) => entry.status === 'warn').length;
  const fail = checks.filter((entry) => entry.status === 'fail').length;

  console.log(
    `\n  ${pass} passed · ${warn} warning${warn === 1 ? '' : 's'} · ${fail} failure${fail === 1 ? '' : 's'}\n`,
  );

  return { pass, warn, fail };
}

/* -------------------------------------------------------------------------- */
/*  Mode 1: the local environment                                             */
/* -------------------------------------------------------------------------- */

function localChecks(): DeploymentCheck[] {
  loadEnvFiles();

  return evaluateEnvironment({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databaseUrl: process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? null,
    databaseToken: process.env.TURSO_AUTH_TOKEN ?? null,
    jwtSecret: process.env.JWT_SECRET ?? null,
    webOrigin: process.env.WEB_ORIGIN ?? null,
    apiInternalUrl: process.env.API_INTERNAL_URL ?? null,
    // Fall back to the API's own defaults so the report is complete even when a
    // variable is simply unset.
    authRateLimitMax: numberOrUndefined(process.env.AUTH_RATE_LIMIT_MAX) ?? 10,
    maxBodyBytes: numberOrUndefined(process.env.MAX_BODY_BYTES) ?? 65_536,
  });
}

function numberOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/* -------------------------------------------------------------------------- */
/*  Mode 2: a running deployment                                              */
/* -------------------------------------------------------------------------- */

async function liveChecks(webUrl: string, apiUrl: string, admin?: string): Promise<Check[]> {
  const checks: Check[] = [];
  const add = async (label: string, run: () => Promise<string>) => {
    try {
      checks.push({ label, status: 'pass', detail: await run() });
    } catch (error) {
      checks.push({
        label,
        status: 'fail',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const fetchWithTimeout = async (url: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      return await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    } finally {
      clearTimeout(timer);
    }
  };

  await add('API liveness', async () => {
    const res = await fetchWithTimeout(`${apiUrl}/api/health`);
    const body = (await res.json()) as { status?: string; version?: string };
    if (res.status !== 200 || body.status !== 'ok') throw new Error(`HTTP ${res.status}`);
    return `200 · v${body.version ?? '?'}`;
  });

  await add('API readiness + database', async () => {
    const res = await fetchWithTimeout(`${apiUrl}/api/health/db`);
    const body = (await res.json()) as {
      connected?: boolean;
      target?: string;
      latencyMs?: number;
      error?: { code?: string; message?: string };
    };

    if (res.status !== 200 || body.connected !== true) {
      throw new Error(`HTTP ${res.status} · ${body.error?.code ?? 'not connected'}`);
    }

    if (body.target === 'file') {
      throw new Error('the deployed API is using a local file: database');
    }

    return `200 · ${body.target} · ${body.latencyMs ?? '?'} ms`;
  });

  await add('Session guard', async () => {
    const res = await fetchWithTimeout(`${apiUrl}/api/auth/me`);
    const body = (await res.json()) as { error?: { code?: string } };
    if (res.status !== 401) throw new Error(`expected 401, received ${res.status}`);
    if (body.error?.code !== 'UNAUTHENTICATED') throw new Error('unexpected error code');
    return '401 UNAUTHENTICATED without a cookie';
  });

  await add('Hardening headers', async () => {
    const res = await fetchWithTimeout(`${apiUrl}/api/health`);
    const missing = ['x-content-type-options', 'referrer-policy', 'x-request-id'].filter(
      (header) => !res.headers.get(header),
    );

    if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`);
    if (res.headers.get('cache-control') !== 'no-store') throw new Error('responses are cacheable');

    return 'nosniff · no-store · request id';
  });

  await add('Error envelope', async () => {
    const res = await fetchWithTimeout(`${apiUrl}/api/definitely-not-a-route`);
    const body = (await res.json()) as { error?: { code?: string } };
    if (res.status !== 404 || body.error?.code !== 'NOT_FOUND') {
      throw new Error(`HTTP ${res.status}`);
    }
    return '404 NOT_FOUND';
  });

  await add('Web app reachable', async () => {
    const res = await fetchWithTimeout(webUrl);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return '200';
  });

  await add('Content-Security-Policy', async () => {
    const res = await fetchWithTimeout(webUrl);
    const csp = res.headers.get('content-security-policy');

    if (!csp) throw new Error('no CSP header');
    if (!csp.includes("default-src 'self'")) throw new Error('CSP is not locked to self');
    if (csp.includes("'unsafe-eval'")) throw new Error('CSP allows eval');

    return 'default-src self · no eval';
  });

  await add('Web → API proxy', async () => {
    const res = await fetchWithTimeout(`${webUrl}/api/health`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return '/api/health answers through the web origin';
  });

  if (admin) {
    const [email, password] = admin.split(':');

    if (!email || !password) throw new Error('--admin expects email:password');

    await add('Server self-report', async () => {
      const login = await fetchWithTimeout(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: webUrl },
        body: JSON.stringify({ email, password }),
      });

      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .find((value) => value?.startsWith('quiz_session='));

      if (!cookie) throw new Error(`sign-in failed with HTTP ${login.status}`);

      const res = await fetchWithTimeout(`${apiUrl}/api/admin/system`, { headers: { cookie } });
      const body = (await res.json()) as {
        summary?: { verdict?: string; fail?: number; warn?: number };
      };

      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);

      const verdict = body.summary?.verdict ?? 'unknown';

      if (verdict === 'blocked') {
        throw new Error(`${body.summary?.fail ?? '?'} configuration failure(s)`);
      }

      return `${verdict} · ${body.summary?.warn ?? 0} warning(s)`;
    });
  }

  return checks;
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                               */
/* -------------------------------------------------------------------------- */

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const url = argument('url');
  const api = argument('api');
  const admin = argument('admin');

  if (!url) {
    const checks = localChecks();
    const { fail } = print(
      checks.map((entry) => ({ label: entry.label, status: entry.status, detail: entry.detail })),
      'Local deployment configuration',
    );
    const summary = summarizeChecks(checks);

    if (fail > 0) {
      console.log('  ✖ Blocked: fix the failures above before deploying.\n');
      process.exit(1);
    }

    console.log(
      summary.verdict === 'ready'
        ? '  ✔ Ready: the configuration can serve production traffic.\n'
        : '  ! Attention: it will run, but review the warnings above.\n',
    );

    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      console.log(
        '  Tip: deployment platforms set NODE_ENV=production for you; locally it is usually unset.\n',
      );
    }

    return;
  }

  if (!/^https?:\/\//.test(url)) {
    console.error('✖ --url must be an absolute http(s) URL.');
    process.exit(2);
  }

  const checks = await liveChecks(url.replace(/\/+$/, ''), (api ?? url).replace(/\/+$/, ''), admin);
  const { fail } = print(checks, `Live deployment · ${url}`);

  if (fail > 0) {
    console.log('  ✖ Blocked: the deployment is not answering as documented.\n');
    process.exit(1);
  }

  console.log('  ✔ Ready: the deployment answers, connects and is hardened.\n');
}

main().catch((error) => {
  console.error('✖ deploy:check could not run:', error instanceof Error ? error.message : error);
  process.exit(2);
});
