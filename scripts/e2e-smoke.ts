/**
 * End-to-end smoke run against a real HTTP server.
 *
 * The Vitest suites call `app.request()` in-process, which is fast but skips
 * the parts that only exist in a deployed process: `serve()`, real sockets, and
 * `Set-Cookie` handling. This script boots the actual API on a free port, talks
 * to it with `fetch`, and asserts the auth flow end to end.
 *
 *   bun run test:e2e
 *
 * It never touches Turso: a throwaway `file:` database is migrated and seeded
 * with the project's own toolchain, then deleted.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dir, '..');
const DB_DIR = path.join(REPO_ROOT, 'packages', 'db');
const API_DIR = path.join(REPO_ROOT, 'apps', 'api');
const DRIZZLE_BIN = path.join(DB_DIR, 'node_modules', '.bin', 'drizzle-kit');
const TSX_BIN = path.join(API_DIR, 'node_modules', '.bin', 'tsx');

const DB_PATH = path.join(REPO_ROOT, '.data', `e2e-${process.pid}.db`);
const DATABASE_URL = `file:${DB_PATH}`;

const ADMIN_EMAIL = 'admin@quiz.dev';
const ADMIN_PASSWORD = 'Admin12345';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

const results: CheckResult[] = [];

/* -------------------------------------------------------------------------- */
/*  helpers                                                                   */
/* -------------------------------------------------------------------------- */

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${path.basename(command)} ${args.join(' ')}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
}

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const started = performance.now();

  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Math.round(performance.now() - started) });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      ms: Math.round(performance.now() - started),
    });
  }
}

function expectStatus(res: Response, expected: number): void {
  if (res.status !== expected) {
    throw new Error(`expected HTTP ${expected}, received ${res.status}`);
  }
}

function cookieFrom(res: Response): string {
  const header = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .find((value) => value?.startsWith('quiz_session='));

  if (!header) throw new Error('no quiz_session cookie in the response');

  return header;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForApi(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // server not listening yet
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`API did not become healthy on ${baseUrl} within ${timeoutMs}ms`);
}

/* -------------------------------------------------------------------------- */
/*  setup                                                                     */
/* -------------------------------------------------------------------------- */

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const dbEnv: NodeJS.ProcessEnv = {
  ...process.env,
  TURSO_DATABASE_URL: DATABASE_URL,
  DATABASE_URL: '',
  TURSO_AUTH_TOKEN: '',
  NODE_ENV: 'test',
};

console.log('\n▸ Preparing a throwaway database (drizzle-kit migrate + seed)…');
run(DRIZZLE_BIN, ['migrate'], DB_DIR, dbEnv);
run(TSX_BIN, ['src/seed.ts'], DB_DIR, dbEnv);

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;

let server: ChildProcess | undefined;

function shutdown(): void {
  server?.kill('SIGTERM');

  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

try {
  console.log(`▸ Starting the API on port ${port}…`);

  server = spawn(TSX_BIN, ['src/index.ts'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_PORT: String(port),
      TURSO_DATABASE_URL: DATABASE_URL,
      DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
      JWT_SECRET: 'e2e-smoke-secret-0123456789abcdefghij',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  await waitForApi(baseUrl);

  /* ------------------------------- checks -------------------------------- */

  const studentEmail = `e2e-${randomUUID()}@quiz.dev`;
  let studentCookie = '';
  let adminCookie = '';

  await check('GET /api/health answers 200', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expectStatus(res, 200);
    const body = (await res.json()) as { status: string; service: string };
    if (body.status !== 'ok' || body.service !== 'quiz-api') {
      throw new Error(`unexpected body: ${JSON.stringify(body)}`);
    }
    return 'ok · quiz-api';
  });

  await check('GET /api/health/db reaches the seeded database', async () => {
    const res = await fetch(`${baseUrl}/api/health/db`);
    expectStatus(res, 200);
    const body = (await res.json()) as { connected: boolean; counts: { users: number } };
    if (!body.connected || body.counts.users < 1) {
      throw new Error(`database not ready: ${JSON.stringify(body)}`);
    }
    return `connected · ${body.counts.users} users`;
  });

  await check('POST /api/auth/register creates an account and a cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'E2E Student', email: studentEmail, password: 'Secret12345' }),
    });
    expectStatus(res, 201);

    const setCookie = res.headers.getSetCookie().join('; ');
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/']) {
      if (!setCookie.includes(attribute)) throw new Error(`cookie is missing ${attribute}`);
    }

    studentCookie = cookieFrom(res);
    const body = (await res.json()) as { user: { role: string; email: string } };
    if (body.user.role !== 'STUDENT' || body.user.email !== studentEmail) {
      throw new Error(`unexpected user: ${JSON.stringify(body.user)}`);
    }

    return '201 · STUDENT · HttpOnly cookie';
  });

  await check('GET /api/auth/me returns the registered user', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: studentCookie } });
    expectStatus(res, 200);
    const body = (await res.json()) as { user: { email: string } };
    if (body.user.email !== studentEmail) throw new Error('wrong user returned');
    return `200 · ${body.user.email}`;
  });

  await check('GET /api/auth/me without a cookie answers 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expectStatus(res, 401);
    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'UNAUTHENTICATED')
      throw new Error(`unexpected code ${body.error.code}`);
    return '401 · UNAUTHENTICATED';
  });

  await check('GET /api/auth/me rejects a tampered cookie', async () => {
    const [name, token] = studentCookie.split('=');
    const tampered = `${name}=${token!.slice(0, -3)}xyz`;
    const res = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: tampered } });
    expectStatus(res, 401);
    return '401 · signature rejected';
  });

  await check('POST /api/auth/login signs the seeded admin in', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    expectStatus(res, 200);
    adminCookie = cookieFrom(res);
    const body = (await res.json()) as { user: { role: string } };
    if (body.user.role !== 'ADMIN') throw new Error(`expected ADMIN, got ${body.user.role}`);
    return '200 · ADMIN';
  });

  await check('POST /api/auth/login rejects a wrong password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: 'definitely-wrong' }),
    });
    expectStatus(res, 401);
    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'INVALID_CREDENTIALS')
      throw new Error(`unexpected code ${body.error.code}`);
    return '401 · INVALID_CREDENTIALS';
  });

  await check('POST /api/auth/register rejects a duplicate email', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Copy', email: studentEmail, password: 'Secret12345' }),
    });
    expectStatus(res, 409);
    return '409 · EMAIL_TAKEN';
  });

  await check('POST /api/auth/register rejects a weak password', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Weak',
        email: `weak-${randomUUID()}@quiz.dev`,
        password: 'short',
      }),
    });
    expectStatus(res, 422);
    return '422 · VALIDATION_ERROR';
  });

  await check('GET /api/admin/access serves the admin scope', async () => {
    const res = await fetch(`${baseUrl}/api/admin/access`, { headers: { cookie: adminCookie } });
    expectStatus(res, 200);
    const body = (await res.json()) as { scope: string; permissions: string[] };
    if (body.scope !== 'ADMIN' || !body.permissions.includes('users:manage')) {
      throw new Error(`unexpected descriptor: ${JSON.stringify(body)}`);
    }
    return '200 · scope ADMIN';
  });

  await check('GET /api/admin/access forbids a student', async () => {
    const res = await fetch(`${baseUrl}/api/admin/access`, { headers: { cookie: studentCookie } });
    expectStatus(res, 403);
    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'FORBIDDEN') throw new Error(`unexpected code ${body.error.code}`);
    return '403 · FORBIDDEN';
  });

  await check('GET /api/student/access forbids an admin', async () => {
    const res = await fetch(`${baseUrl}/api/student/access`, { headers: { cookie: adminCookie } });
    expectStatus(res, 403);
    return '403 · FORBIDDEN';
  });

  await check('GET /api/student/access serves the student scope', async () => {
    const res = await fetch(`${baseUrl}/api/student/access`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);
    const body = (await res.json()) as { scope: string };
    if (body.scope !== 'STUDENT') throw new Error(`unexpected scope ${body.scope}`);
    return '200 · scope STUDENT';
  });

  await check('role-scoped routes reject anonymous callers', async () => {
    const res = await fetch(`${baseUrl}/api/admin/access`);
    expectStatus(res, 401);
    return '401 · UNAUTHENTICATED';
  });

  /* ------------------------------- Day 4 --------------------------------- */

  let e2eUserId = '';

  await check('GET /api/admin/stats reports dashboard aggregates', async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, { headers: { cookie: adminCookie } });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      users: { total: number; active: number; admins: number };
      content: { quizzes: number; questions: number };
      attempts: { total: number; passRate: number };
      recentUsers: unknown[];
    };

    if (body.users.total < 2) throw new Error('expected the seeded accounts');
    if (body.users.admins < 1) throw new Error('expected at least one admin');
    if (body.content.quizzes < 1 || body.content.questions < 1) {
      throw new Error(`seeded content missing: ${JSON.stringify(body.content)}`);
    }
    if (body.attempts.passRate < 0 || body.attempts.passRate > 100) {
      throw new Error(`pass rate out of range: ${body.attempts.passRate}`);
    }

    return `200 · ${body.users.total} users · ${body.content.quizzes} quizzes · ${body.attempts.passRate}% pass`;
  });

  await check('GET /api/admin/stats forbids a student', async () => {
    const res = await fetch(`${baseUrl}/api/admin/stats`, { headers: { cookie: studentCookie } });
    expectStatus(res, 403);
    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'FORBIDDEN') throw new Error(`unexpected code ${body.error.code}`);
    return '403 · FORBIDDEN';
  });

  await check('GET /api/admin/users filters and never leaks hashes', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?search=rahul&role=STUDENT`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const raw = await res.text();
    if (raw.includes('passwordHash') || raw.includes('scrypt')) {
      throw new Error('user payload leaked a credential field');
    }

    const body = JSON.parse(raw) as {
      users: { id: string; email: string; role: string }[];
      pagination: { total: number };
      filters: { search: string | null };
    };

    if (body.users.length !== 1) throw new Error(`expected 1 match, got ${body.users.length}`);
    if (body.users[0]?.email !== 'rahul@quiz.dev') throw new Error('wrong user matched');
    if (body.filters.search !== 'rahul') throw new Error('filter echo missing');

    return `200 · ${body.pagination.total} match · no hash`;
  });

  await check('GET /api/admin/users rejects an out-of-range page size', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?pageSize=500`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 422);
    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'VALIDATION_ERROR') throw new Error('expected VALIDATION_ERROR');
    return '422 · VALIDATION_ERROR';
  });

  await check('PATCH /api/admin/users/:id promotes and demotes an account', async () => {
    const mine = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: studentCookie } });
    expectStatus(mine, 200);
    e2eUserId = ((await mine.json()) as { user: { id: string } }).user.id;

    const promote = await fetch(`${baseUrl}/api/admin/users/${e2eUserId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expectStatus(promote, 200);
    const promoted = (await promote.json()) as { user: { role: string } };
    if (promoted.user.role !== 'ADMIN') throw new Error('promotion did not stick');

    const demote = await fetch(`${baseUrl}/api/admin/users/${e2eUserId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ role: 'STUDENT' }),
    });
    expectStatus(demote, 200);
    const demoted = (await demote.json()) as { user: { role: string } };
    if (demoted.user.role !== 'STUDENT') throw new Error('demotion did not stick');

    return '200 · STUDENT → ADMIN → STUDENT';
  });

  await check('PATCH refuses an admin demoting themselves', async () => {
    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: adminCookie } });
    expectStatus(me, 200);
    const adminId = ((await me.json()) as { user: { id: string } }).user.id;

    const res = await fetch(`${baseUrl}/api/admin/users/${adminId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    expectStatus(res, 409);

    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'SELF_LOCKOUT') throw new Error(`unexpected code ${body.error.code}`);
    return '409 · SELF_LOCKOUT';
  });

  await check('deactivation locks the account out on its next request', async () => {
    const patch = await fetch(`${baseUrl}/api/admin/users/${e2eUserId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    expectStatus(patch, 200);

    const blocked = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: studentCookie } });
    expectStatus(blocked, 403);
    const body = (await blocked.json()) as { error: { code: string } };
    if (body.error.code !== 'ACCOUNT_INACTIVE')
      throw new Error(`unexpected code ${body.error.code}`);

    const restore = await fetch(`${baseUrl}/api/admin/users/${e2eUserId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expectStatus(restore, 200);

    const again = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: studentCookie } });
    expectStatus(again, 200);

    return '403 ACCOUNT_INACTIVE · restored';
  });

  await check('admin user management forbids a student', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie: studentCookie } });
    expectStatus(res, 403);
    return '403 · FORBIDDEN';
  });

  await check('POST /api/auth/logout clears the cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const cleared = res.headers.getSetCookie().find((value) => value.startsWith('quiz_session='));
    if (!cleared?.includes('Max-Age=0')) throw new Error('cookie was not cleared');

    return '200 · Max-Age=0';
  });

  await check('unknown routes answer with the error envelope', async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expectStatus(res, 404);
    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'NOT_FOUND') throw new Error(`unexpected code ${body.error.code}`);
    return '404 · NOT_FOUND';
  });
} finally {
  shutdown();
}

/* -------------------------------------------------------------------------- */
/*  report                                                                    */
/* -------------------------------------------------------------------------- */

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log('');

for (const result of results) {
  const mark = result.ok ? '✓' : '✗';
  console.log(`  ${mark} ${result.name.padEnd(52)} ${result.detail} (${result.ms}ms)`);
}

console.log(
  `\n  ${passed}/${results.length} checks passed${failed > 0 ? ` — ${failed} failed` : ''}\n`,
);

if (failed > 0) process.exit(1);
