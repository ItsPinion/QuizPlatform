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

  /* ------------------------------- Day 5 --------------------------------- */

  let createdQuizId = '';
  let createdQuizSlug = '';
  let e2eCategoryId = '';

  await check('GET /api/admin/categories lists categories with counts', async () => {
    const res = await fetch(`${baseUrl}/api/admin/categories`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as { categories: { id: string; quizCount: number }[] };
    if (body.categories.length < 5) throw new Error('expected the seeded categories');

    return `200 · ${body.categories.length} categories`;
  });

  await check('typed category matches case-insensitively (no duplicates)', async () => {
    const before = (await (
      await fetch(`${baseUrl}/api/admin/categories`, { headers: { cookie: adminCookie } })
    ).json()) as { categories: { id: string; name: string }[] };

    const existing = before.categories[0];
    if (!existing) throw new Error('expected seeded categories');

    const res = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ name: `  ${existing.name.toUpperCase()}  ` }),
    });
    expectStatus(res, 200);

    const body = (await res.json()) as { category: { id: string }; created: boolean };
    if (body.created !== false) throw new Error('an existing name must not create a row');
    if (body.category.id !== existing.id) throw new Error('matched the wrong category');

    const after = (await (
      await fetch(`${baseUrl}/api/admin/categories`, { headers: { cookie: adminCookie } })
    ).json()) as { categories: unknown[] };
    if (after.categories.length !== before.categories.length) {
      throw new Error('the category count moved');
    }

    return `200 · reused "${existing.name}" (created: false)`;
  });

  await check('POST /api/admin/quizzes accepts a category name', async () => {
    const categories = (await (
      await fetch(`${baseUrl}/api/admin/categories`, { headers: { cookie: adminCookie } })
    ).json()) as { categories: { id: string; name: string }[] };

    const target = categories.categories[0];
    if (!target) throw new Error('expected seeded categories');

    const res = await fetch(`${baseUrl}/api/admin/quizzes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        title: 'E2E Category Name Quiz',
        categoryName: target.name.toLowerCase(),
        durationMinutes: 10,
        passingScore: 40,
      }),
    });
    expectStatus(res, 201);

    const body = (await res.json()) as {
      quiz: { id: string; categoryId: string; categoryName: string };
    };
    if (body.quiz.categoryId !== target.id) throw new Error('category name did not resolve');

    const cleanup = await fetch(`${baseUrl}/api/admin/quizzes/${body.quiz.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(cleanup, 200);

    return `201 · resolved "${body.quiz.categoryName}" by name, then deleted`;
  });

  await check('GET /api/admin/quizzes returns aggregates', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes?pageSize=5`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      quizzes: { questionCount: number; categoryName: string; status: string }[];
      pagination: { total: number };
    };

    if (body.pagination.total < 10) throw new Error('expected the seeded quizzes');
    if (!body.quizzes.every((quiz) => quiz.categoryName && quiz.status)) {
      throw new Error('quiz rows are missing their joined fields');
    }
    if (!body.quizzes.some((quiz) => quiz.questionCount > 0)) {
      throw new Error('expected question counts');
    }

    return `200 · ${body.pagination.total} quizzes`;
  });

  await check('POST /api/admin/quizzes creates a draft with a derived slug', async () => {
    const categories = (await (
      await fetch(`${baseUrl}/api/admin/categories`, { headers: { cookie: adminCookie } })
    ).json()) as { categories: { id: string }[] };

    const res = await fetch(`${baseUrl}/api/admin/quizzes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        title: 'E2E Smoke Quiz',
        categoryId: categories.categories[0]?.id,
        durationMinutes: 15,
        passingScore: 50,
        maxAttempts: 1,
      }),
    });
    expectStatus(res, 201);

    const body = (await res.json()) as {
      quiz: { id: string; slug: string; status: string; questionCount: number };
    };

    if (body.quiz.status !== 'DRAFT') throw new Error('new quizzes must start as DRAFT');
    if (body.quiz.slug !== 'e2e-smoke-quiz') throw new Error(`unexpected slug ${body.quiz.slug}`);
    if (body.quiz.questionCount !== 0) throw new Error('a new quiz has no questions');

    createdQuizId = body.quiz.id;
    createdQuizSlug = body.quiz.slug;

    return `201 · DRAFT · ${createdQuizSlug}`;
  });

  await check('PATCH /api/admin/quizzes/:id edits without moving the slug', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes/${createdQuizId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ title: 'E2E Smoke Quiz (edited)', durationMinutes: 25 }),
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      quiz: { title: string; durationMinutes: number; slug: string };
    };

    if (body.quiz.title !== 'E2E Smoke Quiz (edited)') throw new Error('title did not change');
    if (body.quiz.durationMinutes !== 25) throw new Error('duration did not change');
    if (body.quiz.slug !== createdQuizSlug) throw new Error('slug must stay stable');

    return '200 · title + duration updated, slug kept';
  });

  await check('publishing a quiz with no questions is refused', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes/${createdQuizId}/publish`, {
      method: 'POST',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 409);

    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'QUIZ_HAS_NO_QUESTIONS') {
      throw new Error(`unexpected code ${body.error.code}`);
    }

    return '409 · QUIZ_HAS_NO_QUESTIONS';
  });

  await check('a seeded draft can be published and unpublished', async () => {
    const list = (await (
      await fetch(`${baseUrl}/api/admin/quizzes?status=DRAFT&pageSize=50`, {
        headers: { cookie: adminCookie },
      })
    ).json()) as { quizzes: { id: string; questionCount: number }[] };

    const draft = list.quizzes.find((quiz) => quiz.questionCount > 0);
    if (!draft) throw new Error('expected a seeded draft with questions');

    const publish = await fetch(`${baseUrl}/api/admin/quizzes/${draft.id}/publish`, {
      method: 'POST',
      headers: { cookie: adminCookie },
    });
    expectStatus(publish, 200);
    if (((await publish.json()) as { quiz: { status: string } }).quiz.status !== 'PUBLISHED') {
      throw new Error('publish did not apply');
    }

    const unpublish = await fetch(`${baseUrl}/api/admin/quizzes/${draft.id}/unpublish`, {
      method: 'POST',
      headers: { cookie: adminCookie },
    });
    expectStatus(unpublish, 200);
    if (((await unpublish.json()) as { quiz: { status: string } }).quiz.status !== 'UNPUBLISHED') {
      throw new Error('unpublish did not apply');
    }

    return 'PUBLISHED → UNPUBLISHED';
  });

  await check('deleting a quiz with attempts is refused', async () => {
    const list = (await (
      await fetch(`${baseUrl}/api/admin/quizzes?pageSize=50`, { headers: { cookie: adminCookie } })
    ).json()) as { quizzes: { id: string; attemptCount: number }[] };

    const attempted = list.quizzes.find((quiz) => quiz.attemptCount > 0);
    if (!attempted) throw new Error('expected an attempted quiz in the seed');

    const res = await fetch(`${baseUrl}/api/admin/quizzes/${attempted.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 409);

    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'QUIZ_HAS_ATTEMPTS') throw new Error(`unexpected ${body.error.code}`);

    return '409 · QUIZ_HAS_ATTEMPTS';
  });

  await check('deleting a quiz without attempts removes it', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes/${createdQuizId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const after = await fetch(`${baseUrl}/api/admin/quizzes/${createdQuizId}`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(after, 404);

    return '200 · then 404';
  });

  /* ------------------------------- Day 6 --------------------------------- */

  let authoredQuizId = '';
  let authoredQuestionIds: string[] = [];
  let retainedOptionId = '';

  await check('POST /api/admin/categories creates, PATCH renames it', async () => {
    const name = `E2E Category ${Date.now()}`;

    const created = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ name }),
    });
    expectStatus(created, 201);

    const body = (await created.json()) as {
      category: { id: string; name: string; slug: string };
      created: boolean;
    };
    if (!body.created) throw new Error('a new name must report created: true');

    const renamed = await fetch(`${baseUrl}/api/admin/categories/${body.category.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ name: `${name} Renamed`, description: 'Made by the smoke run.' }),
    });
    expectStatus(renamed, 200);

    const after = (await renamed.json()) as {
      category: { name: string; slug: string; description: string | null };
    };
    if (after.category.name !== `${name} Renamed`) throw new Error('rename did not apply');
    if (after.category.slug !== body.category.slug) throw new Error('the slug must stay stable');
    if (after.category.description !== 'Made by the smoke run.') {
      throw new Error('description did not save');
    }

    e2eCategoryId = body.category.id;

    return `201 → 200 · ${after.category.slug}`;
  });

  await check('deleting a category with quizzes is refused', async () => {
    const list = (await (
      await fetch(`${baseUrl}/api/admin/categories`, { headers: { cookie: adminCookie } })
    ).json()) as { categories: { id: string; quizCount: number }[] };

    const inUse = list.categories.find((category) => category.quizCount > 0);
    if (!inUse) throw new Error('expected a category with quizzes');

    const res = await fetch(`${baseUrl}/api/admin/categories/${inUse.id}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 409);

    const body = (await res.json()) as { error: { code: string } };
    if (body.error.code !== 'CATEGORY_HAS_QUIZZES')
      throw new Error(`unexpected ${body.error.code}`);

    return `409 · CATEGORY_HAS_QUIZZES · ${inUse.quizCount} quizzes`;
  });

  await check('deleting an empty category succeeds', async () => {
    const res = await fetch(`${baseUrl}/api/admin/categories/${e2eCategoryId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const after = await fetch(`${baseUrl}/api/admin/categories/${e2eCategoryId}`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(after, 404);

    return '200 · then 404';
  });

  await check('POST /api/admin/quizzes/:id/questions authors a question', async () => {
    const categories = (await (
      await fetch(`${baseUrl}/api/admin/categories`, { headers: { cookie: adminCookie } })
    ).json()) as { categories: { name: string }[] };

    const quizRes = await fetch(`${baseUrl}/api/admin/quizzes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        title: 'E2E Authored Quiz',
        categoryName: categories.categories[0]?.name,
        durationMinutes: 10,
        passingScore: 50,
      }),
    });
    expectStatus(quizRes, 201);

    authoredQuizId = ((await quizRes.json()) as { quiz: { id: string } }).quiz.id;

    const empty = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/questions`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(empty, 200);
    if (((await empty.json()) as { questions: unknown[] }).questions.length !== 0) {
      throw new Error('a new quiz should have no questions');
    }

    const res = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        questionText: 'Which method parses JSON?',
        explanation: 'JSON.parse turns a string into an object.',
        marks: 2,
        difficulty: 'EASY',
        options: [
          { text: 'JSON.stringify()' },
          { text: 'JSON.parse()' },
          { text: 'JSON.convert()' },
          { text: 'JSON.object()' },
        ],
        correctIndex: 1,
      }),
    });
    expectStatus(res, 201);

    const question = (
      (await res.json()) as {
        question: {
          id: string;
          position: number;
          marks: number;
          options: { id: string; isCorrect: boolean }[];
        };
      }
    ).question;

    if (question.position !== 0) throw new Error('the first question should sit at position 0');
    if (question.marks !== 2) throw new Error('marks were not stored');
    if (question.options.filter((option) => option.isCorrect).length !== 1) {
      throw new Error('exactly one option must be correct');
    }

    authoredQuestionIds = [question.id];
    retainedOptionId = question.options[0]?.id ?? '';

    return `201 · position 0 · ${question.options.length} options · 1 correct`;
  });

  await check('a question with no options in range is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        questionText: 'Too few options here?',
        options: [{ text: 'Only one' }],
        correctIndex: 0,
      }),
    });
    expectStatus(res, 422);

    return '422 · VALIDATION_ERROR';
  });

  await check('questions can be reordered as a whole list', async () => {
    const second = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        questionText: 'Which one runs first?',
        options: [{ text: 'Sync code' }, { text: 'A microtask' }],
        correctIndex: 0,
      }),
    });
    expectStatus(second, 201);

    const secondId = ((await second.json()) as { question: { id: string } }).question.id;
    authoredQuestionIds = [...authoredQuestionIds, secondId];

    const res = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/questions/order`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ ids: [secondId, authoredQuestionIds[0]] }),
    });
    expectStatus(res, 200);

    const body = (await res.json()) as { questions: { id: string; position: number }[] };
    if (body.questions[0]?.id !== secondId) throw new Error('the order did not change');
    if (body.questions.map((question) => question.position).join() !== '0,1') {
      throw new Error('positions were not compacted');
    }

    return '200 · positions 0,1';
  });

  await check('PUT replaces a question and keeps retained option ids', async () => {
    const res = await fetch(`${baseUrl}/api/admin/questions/${authoredQuestionIds[0]}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        questionText: 'Which method parses JSON into an object?',
        options: [{ id: retainedOptionId, text: 'JSON.stringify()' }, { text: 'JSON.parse()' }],
        correctIndex: 1,
      }),
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      question: { questionText: string; options: { id: string; isCorrect: boolean }[] };
    };

    if (body.question.options.length !== 2) throw new Error('options were not replaced');
    if (body.question.options[0]?.id !== retainedOptionId) {
      throw new Error('a retained option must keep its id');
    }
    if (!body.question.options[1]?.isCorrect) throw new Error('the new correct option was lost');

    return '200 · 4 → 2 options, 1 correct';
  });

  await check('publishing works once a quiz has questions', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/publish`, {
      method: 'POST',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as { quiz: { status: string; questionCount: number } };
    if (body.quiz.status !== 'PUBLISHED') throw new Error('publish did not apply');
    if (body.quiz.questionCount !== 2) throw new Error('questionCount should be 2');

    return '200 · PUBLISHED · 2 questions';
  });

  await check('a published quiz cannot lose its last question', async () => {
    const first = await fetch(`${baseUrl}/api/admin/questions/${authoredQuestionIds[0]}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(first, 200);

    const blocked = await fetch(`${baseUrl}/api/admin/questions/${authoredQuestionIds[1]}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(blocked, 409);

    const body = (await blocked.json()) as { error: { code: string } };
    if (body.error.code !== 'QUIZ_WOULD_HAVE_NO_QUESTIONS') {
      throw new Error(`unexpected ${body.error.code}`);
    }

    const unpublish = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}/unpublish`, {
      method: 'POST',
      headers: { cookie: adminCookie },
    });
    expectStatus(unpublish, 200);

    const allowed = await fetch(`${baseUrl}/api/admin/questions/${authoredQuestionIds[1]}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(allowed, 200);

    return 'DELETE 200 · 409 · unpublish · 200';
  });

  await check('the authored quiz is removed again', async () => {
    const res = await fetch(`${baseUrl}/api/admin/quizzes/${authoredQuizId}`, {
      method: 'DELETE',
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    return '200 · cleaned up';
  });

  await check('quiz management rejects a student', async () => {
    const list = await fetch(`${baseUrl}/api/admin/quizzes`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(list, 403);

    const create = await fetch(`${baseUrl}/api/admin/quizzes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: studentCookie },
      body: JSON.stringify({ title: 'Nope', categoryId: 'nope' }),
    });
    expectStatus(create, 403);

    const category = await fetch(`${baseUrl}/api/admin/categories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: studentCookie },
      body: JSON.stringify({ name: 'Student Category' }),
    });
    expectStatus(category, 403);

    const question = await fetch(`${baseUrl}/api/admin/questions/${crypto.randomUUID()}`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(question, 403);

    return '403 · FORBIDDEN';
  });

  /* ------------------------------- Day 7 --------------------------------- */

  let studentQuizId = '';
  let attemptId = '';
  let firstQuestionId = '';
  let firstOptionId = '';
  let studentQuestionCount = 0;
  let submittedPercentage = 0;
  let submittedCompletedAt = '';

  await check('GET /api/student/quizzes lists only published quizzes', async () => {
    const res = await fetch(`${baseUrl}/api/student/quizzes?pageSize=24`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      quizzes: { id: string; title: string; questionCount: number; attemptsUsed: number }[];
      pagination: { total: number };
    };

    if (body.quizzes.length < 5) throw new Error('expected the seeded catalogue');
    if (body.quizzes.some((quiz) => quiz.questionCount === 0)) {
      throw new Error('a published quiz should have questions');
    }
    if (body.quizzes.some((quiz) => quiz.title === 'Java OOP Concepts')) {
      throw new Error('a DRAFT quiz must never reach a student');
    }

    studentQuizId = body.quizzes[0]?.id ?? '';

    return `200 · ${body.pagination.total} published`;
  });

  await check('a student cannot see drafts by guessing their id', async () => {
    // The seeded draft was published and unpublished earlier in this run, so
    // look for anything that is not live rather than assuming its status.
    const hidden: string[] = [];

    for (const status of ['DRAFT', 'UNPUBLISHED']) {
      const list = (await (
        await fetch(`${baseUrl}/api/admin/quizzes?status=${status}`, {
          headers: { cookie: adminCookie },
        })
      ).json()) as { quizzes: { id: string }[] };

      hidden.push(...list.quizzes.map((quiz) => quiz.id));
    }

    const draftId = hidden[0];
    if (!draftId) throw new Error('expected a quiz that is not published');

    const res = await fetch(`${baseUrl}/api/student/quizzes/${draftId}`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 404);

    return '404 · QUIZ_NOT_FOUND';
  });

  await check('POST /api/student/quizzes/:id/start creates one attempt', async () => {
    const first = await fetch(`${baseUrl}/api/student/quizzes/${studentQuizId}/start`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });
    expectStatus(first, 201);

    const body = (await first.json()) as {
      attemptId: string;
      resumed: boolean;
      secondsRemaining: number;
    };

    if (body.resumed) throw new Error('the first start must not be a resume');
    if (body.secondsRemaining <= 0) throw new Error('an attempt needs a live deadline');

    attemptId = body.attemptId;

    const second = await fetch(`${baseUrl}/api/student/quizzes/${studentQuizId}/start`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });
    expectStatus(second, 201);

    const resumed = (await second.json()) as { attemptId: string; resumed: boolean };
    if (!resumed.resumed) throw new Error('a second start should resume');
    if (resumed.attemptId !== attemptId) throw new Error('resuming must not create a new attempt');

    return `201 · resumed the same attempt`;
  });

  await check('the attempt payload carries no answer key', async () => {
    const res = await fetch(`${baseUrl}/api/student/attempts/${attemptId}`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const raw = await res.text();
    if (/isCorrect|is_correct|explanation/i.test(raw)) {
      throw new Error('the attempt payload leaks grading data');
    }

    const body = JSON.parse(raw) as {
      questions: { id: string; options: { id: string }[] }[];
      answers: unknown[];
      attempt: { secondsRemaining: number; expired: boolean };
    };

    if (body.attempt.expired) throw new Error('the attempt should still be live');
    if (body.answers.length !== 0) throw new Error('a fresh attempt has no answers');
    if (body.questions.length === 0) throw new Error('expected questions');

    firstQuestionId = body.questions[0]?.id ?? '';
    firstOptionId = body.questions[0]?.options[0]?.id ?? '';
    studentQuestionCount = body.questions.length;

    return `200 · ${body.questions.length} questions · no isCorrect`;
  });

  await check('saving an answer persists it and reports progress', async () => {
    const res = await fetch(
      `${baseUrl}/api/student/attempts/${attemptId}/answers/${firstQuestionId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ optionId: firstOptionId }),
      },
    );
    expectStatus(res, 200);

    const body = (await res.json()) as {
      answer: { selectedOptionId: string };
      progress: { answered: number; total: number };
    };

    if (body.answer.selectedOptionId !== firstOptionId) throw new Error('answer was not saved');
    if (body.progress.answered !== 1) throw new Error('progress did not count the answer');

    const session = (await (
      await fetch(`${baseUrl}/api/student/attempts/${attemptId}`, {
        headers: { cookie: studentCookie },
      })
    ).json()) as { answers: { questionId: string; selectedOptionId: string }[] };

    if (session.answers[0]?.selectedOptionId !== firstOptionId) {
      throw new Error('the saved answer did not round-trip');
    }

    return `200 · ${body.progress.answered}/${body.progress.total} answered`;
  });

  await check('another student cannot read or write this attempt', async () => {
    const ownerCookie = await (async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'priya@quiz.dev', password: 'Password123' }),
      });
      expectStatus(res, 200);

      const value = res.headers.getSetCookie().find((cookie) => cookie.startsWith('quiz_session='));
      if (!value) throw new Error('login did not issue a cookie');
      return value.split(';')[0] as string;
    })();

    const read = await fetch(`${baseUrl}/api/student/attempts/${attemptId}`, {
      headers: { cookie: ownerCookie },
    });
    expectStatus(read, 404);

    const write = await fetch(
      `${baseUrl}/api/student/attempts/${attemptId}/answers/${firstQuestionId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({ optionId: null }),
      },
    );
    expectStatus(write, 404);

    return '404 · ATTEMPT_NOT_FOUND';
  });

  await check('student routes reject an admin', async () => {
    const list = await fetch(`${baseUrl}/api/student/quizzes`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(list, 403);

    const start = await fetch(`${baseUrl}/api/student/quizzes/${studentQuizId}/start`, {
      method: 'POST',
      headers: { cookie: adminCookie },
    });
    expectStatus(start, 403);

    return '403 · FORBIDDEN';
  });

  /* ------------------------------- Day 8 --------------------------------- */

  await check('POST /api/student/attempts/:id/submit grades the paper', async () => {
    const res = await fetch(`${baseUrl}/api/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const raw = await res.text();
    if (/isCorrect|is_correct|"explanation"/i.test(raw)) {
      throw new Error('the submission leaks the answer key');
    }

    const body = JSON.parse(raw) as {
      alreadySubmitted: boolean;
      result: {
        score: number;
        totalMarks: number;
        percentage: number;
        correctAnswers: number;
        incorrectAnswers: number;
        unanswered: number;
        passed: boolean;
        status: string;
        timeTakenSeconds: number;
        completedAt: string;
        autoSubmitted: boolean;
      };
    };

    const { result } = body;

    if (body.alreadySubmitted) throw new Error('the first submit must grade');
    if (
      result.correctAnswers + result.incorrectAnswers + result.unanswered !==
      studentQuestionCount
    ) {
      throw new Error('the counts do not add up to the paper');
    }
    if (result.totalMarks <= 0) throw new Error('expected marks on the paper');
    if (result.percentage < 0 || result.percentage > 100) {
      throw new Error(`percentage out of range: ${result.percentage}`);
    }
    if (result.status !== (result.passed ? 'PASSED' : 'FAILED')) {
      throw new Error('status and passed disagree');
    }
    if (result.timeTakenSeconds < 0) throw new Error('negative time taken');
    if (!result.completedAt) throw new Error('a graded attempt needs completedAt');

    submittedPercentage = result.percentage;
    submittedCompletedAt = result.completedAt;

    return `200 · ${result.percentage}% · ${result.status}`;
  });

  await check('submitting twice returns the stored result', async () => {
    const res = await fetch(`${baseUrl}/api/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      alreadySubmitted: boolean;
      result: { percentage: number; completedAt: string };
    };

    if (!body.alreadySubmitted) throw new Error('a retry should not grade again');
    if (body.result.percentage !== submittedPercentage) throw new Error('percentage changed');
    if (body.result.completedAt !== submittedCompletedAt) throw new Error('completedAt changed');

    return '200 · alreadySubmitted: true';
  });

  await check('the graded attempt is locked and reports its result', async () => {
    const session = await fetch(`${baseUrl}/api/student/attempts/${attemptId}`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(session, 200);

    const raw = await session.text();
    if (/isCorrect|is_correct|"explanation"/i.test(raw)) {
      throw new Error('a graded attempt leaks the answer key');
    }

    const body = JSON.parse(raw) as {
      attempt: { status: string; expired: boolean; result: { percentage: number } | null };
    };

    if (body.attempt.status === 'IN_PROGRESS') throw new Error('the attempt is still open');
    if (body.attempt.expired) throw new Error('a graded attempt is finished, not expired');
    if (body.attempt.result?.percentage !== submittedPercentage) {
      throw new Error('the session result disagrees with the submission');
    }

    const write = await fetch(
      `${baseUrl}/api/student/attempts/${attemptId}/answers/${firstQuestionId}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie: studentCookie },
        body: JSON.stringify({ optionId: null }),
      },
    );
    expectStatus(write, 409);

    const failure = (await write.json()) as { error: { code: string } };
    if (failure.error.code !== 'ATTEMPT_NOT_ACTIVE') {
      throw new Error(`unexpected code ${failure.error.code}`);
    }

    return '409 · ATTEMPT_NOT_ACTIVE';
  });

  await check('the catalogue reflects the graded attempt', async () => {
    const res = await fetch(`${baseUrl}/api/student/quizzes?pageSize=24`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      quizzes: {
        id: string;
        bestPercentage: number | null;
        inProgressAttemptId: string | null;
        attemptsUsed: number;
      }[];
    };

    const quiz = body.quizzes.find((candidate) => candidate.id === studentQuizId);
    if (!quiz) throw new Error('the quiz vanished from the catalogue');
    if (quiz.inProgressAttemptId) throw new Error('a finished attempt must not be resumable');
    if (quiz.bestPercentage !== submittedPercentage) {
      throw new Error(`best percentage ${quiz.bestPercentage} !== ${submittedPercentage}`);
    }
    if (quiz.attemptsUsed < 1) throw new Error('the attempt was not counted');

    return `200 · best ${quiz.bestPercentage}% · ${quiz.attemptsUsed} used`;
  });

  await check('another student cannot submit this attempt', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'priya@quiz.dev', password: 'Password123' }),
    });
    expectStatus(res, 200);

    const cookie = res.headers
      .getSetCookie()
      .find((value) => value.startsWith('quiz_session='))
      ?.split(';')[0];

    if (!cookie) throw new Error('login did not issue a cookie');

    const submit = await fetch(`${baseUrl}/api/student/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: { cookie },
    });
    expectStatus(submit, 404);

    const body = (await submit.json()) as { error: { code: string } };
    if (body.error.code !== 'ATTEMPT_NOT_FOUND')
      throw new Error(`unexpected code ${body.error.code}`);

    return '404 · ATTEMPT_NOT_FOUND';
  });

  /* ------------------------------- Day 9 --------------------------------- */

  await check('GET /api/student/attempts/:id/review shows the key', async () => {
    const res = await fetch(`${baseUrl}/api/student/attempts/${attemptId}/review`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      questions: {
        verdict: string;
        selectedOptionId: string | null;
        correctOptionId: string | null;
        explanation: string | null;
        earnedMarks: number;
        marks: number;
        options: { id: string; isCorrect: boolean; selected: boolean }[];
      }[];
      counts: { all: number; correct: number; incorrect: number; unanswered: number };
      result: { score: number; correctAnswers: number };
      attempt: { autoSubmitted: boolean; completedAt: string };
    };

    if (body.questions.length !== studentQuestionCount) {
      throw new Error('the review should cover the whole paper');
    }
    if (body.counts.all !== body.questions.length)
      throw new Error('counts disagree with the paper');
    if (body.counts.correct + body.counts.incorrect + body.counts.unanswered !== body.counts.all) {
      throw new Error('the three verdicts do not add up');
    }
    if (body.counts.correct !== body.result.correctAnswers) {
      throw new Error('review verdicts disagree with the stored score');
    }
    if (
      !body.questions.every((question) => question.options.filter((o) => o.isCorrect).length === 1)
    ) {
      throw new Error('every question should have exactly one correct option');
    }

    const earned = body.questions.reduce((sum, question) => sum + question.earnedMarks, 0);
    if (earned !== body.result.score) throw new Error('earned marks disagree with the score');

    if (!body.questions.some((question) => question.explanation)) {
      throw new Error('the seeded questions should carry explanations');
    }
    if (
      body.questions.some(
        (question) => question.verdict === 'CORRECT' && !question.selectedOptionId,
      )
    ) {
      throw new Error('a correct verdict needs a selection');
    }

    return `200 · ${body.counts.correct}/${body.counts.all} correct · key released`;
  });

  await check('a running attempt refuses to reveal the key', async () => {
    const start = await fetch(`${baseUrl}/api/student/quizzes/${studentQuizId}/start`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });

    // Every attempt is spent, so the only path left is the 409 for the quiz.
    const body = (await start.json()) as { attemptId?: string; error?: { code: string } };

    if (body.attemptId) {
      const res = await fetch(`${baseUrl}/api/student/attempts/${body.attemptId}/review`, {
        headers: { cookie: studentCookie },
      });
      expectStatus(res, 409);

      const raw = await res.text();
      if (/isCorrect/.test(raw)) throw new Error('the refusal leaked the key');

      return '409 · ATTEMPT_NOT_ACTIVE';
    }

    if (body.error?.code !== 'ATTEMPTS_EXHAUSTED') {
      throw new Error(`unexpected start response ${JSON.stringify(body)}`);
    }

    // The quiz has no attempts left: verify the guard on a fresh one instead.
    const quizzes = (await (
      await fetch(`${baseUrl}/api/student/quizzes?pageSize=24`, {
        headers: { cookie: studentCookie },
      })
    ).json()) as { quizzes: { id: string; attemptsRemaining: number }[] };

    const open = quizzes.quizzes.find((quiz) => quiz.attemptsRemaining > 0);
    if (!open) throw new Error('expected a quiz with attempts left');

    const fresh = await fetch(`${baseUrl}/api/student/quizzes/${open.id}/start`, {
      method: 'POST',
      headers: { cookie: studentCookie },
    });
    expectStatus(fresh, 201);

    const { attemptId: freshId } = (await fresh.json()) as { attemptId: string };
    const res = await fetch(`${baseUrl}/api/student/attempts/${freshId}/review`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 409);

    const raw = await res.text();
    if (/isCorrect/.test(raw)) throw new Error('the refusal leaked the key');

    return '409 · ATTEMPT_NOT_ACTIVE';
  });

  await check('the attempt history lists the graded paper', async () => {
    const res = await fetch(`${baseUrl}/api/student/attempts?pageSize=50`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      attempts: {
        id: string;
        status: string;
        percentage: number;
        passed: boolean;
        inProgress: boolean;
        completedAt: string | null;
      }[];
      pagination: { total: number };
      totals: { attempts: number; passed: number; bestPercentage: number | null };
    };

    const row = body.attempts.find((attempt) => attempt.id === attemptId);
    if (!row) throw new Error('the graded attempt is missing from the history');
    if (row.inProgress) throw new Error('a graded attempt must not read as in progress');
    if (row.passed !== (row.status === 'PASSED')) throw new Error('passed disagrees with status');
    if (row.percentage !== submittedPercentage) throw new Error('history percentage changed');
    if (!row.completedAt) throw new Error('a finished attempt needs completedAt');
    if (body.totals.attempts < body.pagination.total) {
      throw new Error('totals should cover at least the filtered page total');
    }

    return `200 · ${body.pagination.total} attempts · best ${body.totals.bestPercentage}%`;
  });

  await check('the history filters by status', async () => {
    const res = await fetch(`${baseUrl}/api/student/attempts?status=PASSED&pageSize=50`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      attempts: { status: string }[];
      filters: { status: string };
    };
    if (body.filters.status !== 'PASSED') throw new Error('the filter was not echoed');
    if (body.attempts.some((attempt) => attempt.status !== 'PASSED')) {
      throw new Error('a filtered page returned another status');
    }

    return `200 · ${body.attempts.length} passed`;
  });

  await check('another student cannot read this review', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'priya@quiz.dev', password: 'Password123' }),
    });
    expectStatus(res, 200);

    const cookie = res.headers
      .getSetCookie()
      .find((value) => value.startsWith('quiz_session='))
      ?.split(';')[0];

    if (!cookie) throw new Error('login did not issue a cookie');

    const review = await fetch(`${baseUrl}/api/student/attempts/${attemptId}/review`, {
      headers: { cookie },
    });
    expectStatus(review, 404);

    const body = (await review.json()) as { error: { code: string } };
    if (body.error.code !== 'ATTEMPT_NOT_FOUND')
      throw new Error(`unexpected code ${body.error.code}`);

    return '404 · ATTEMPT_NOT_FOUND';
  });

  /* ------------------------------- Day 10 -------------------------------- */

  await check('GET /api/student/dashboard returns the six statistics', async () => {
    const res = await fetch(`${baseUrl}/api/student/dashboard`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      totals: {
        attempts: number;
        quizzesAttempted: number;
        quizzesAvailable: number;
        passed: number;
        failed: number;
        inProgress: number;
        averagePercentage: number | null;
        bestPercentage: number | null;
        passRate: number | null;
        questionsAnswered: number;
      };
      trend: { percentage: number; completedAt: string }[];
      categories: { attempts: number; passed: number; failed: number }[];
      activity: { date: string; attempts: number }[];
      recent: { id: string }[];
      streak: { current: number; best: number };
    };

    const { totals } = body;

    if (totals.attempts < 1) throw new Error('the e2e student has an attempt by now');
    if (totals.passed + totals.failed + totals.inProgress !== totals.attempts) {
      throw new Error('the status counts do not add up to the attempts');
    }
    if (totals.quizzesAttempted > totals.quizzesAvailable) {
      throw new Error('attempted more quizzes than are published');
    }
    if (
      totals.averagePercentage == null ||
      totals.averagePercentage < 0 ||
      totals.averagePercentage > 100
    ) {
      throw new Error(`average out of range: ${totals.averagePercentage}`);
    }
    if (totals.bestPercentage == null || totals.bestPercentage < totals.averagePercentage) {
      throw new Error('the best score should be at least the average');
    }
    if (totals.passRate != null && (totals.passRate < 0 || totals.passRate > 100)) {
      throw new Error(`pass rate out of range: ${totals.passRate}`);
    }
    if (body.streak.best < body.streak.current) throw new Error('streak ordering is wrong');

    if (body.trend.length === 0) throw new Error('expected a trend point from the graded attempt');

    const dates = body.trend.map((point) => Date.parse(point.completedAt));
    if (JSON.stringify([...dates].sort((a, b) => a - b)) !== JSON.stringify(dates)) {
      throw new Error('the trend must be chronological');
    }

    if (body.activity.length !== 14) throw new Error('expected a fourteen-day window');
    if (body.activity.some((day) => day.attempts < 0)) throw new Error('negative activity');

    const categoryAttempts = body.categories.reduce((sum, category) => sum + category.attempts, 0);
    if (categoryAttempts !== totals.passed + totals.failed) {
      throw new Error('category attempts do not add up to the graded attempts');
    }

    if (body.recent.length === 0) throw new Error('expected recent attempts');
    if (!body.recent.some((attempt) => attempt.id === attemptId)) {
      throw new Error('the graded attempt is missing from recent');
    }

    return `200 · ${totals.attempts} attempts · avg ${totals.averagePercentage}% · ${body.trend.length} trend points`;
  });

  await check('the dashboard is scoped to the student and rejects an admin', async () => {
    const unknown = await fetch(`${baseUrl}/api/student/dashboard`);
    expectStatus(unknown, 401);

    const admin = await fetch(`${baseUrl}/api/student/dashboard`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(admin, 403);

    const mine = (await (
      await fetch(`${baseUrl}/api/student/dashboard`, { headers: { cookie: studentCookie } })
    ).json()) as { recent: { id: string }[] };

    // Priya is a different seeded student; the e2e account must not see her rows.
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'priya@quiz.dev', password: 'Password123' }),
    });
    expectStatus(login, 200);

    const priyaCookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('quiz_session='))
      ?.split(';')[0];

    if (!priyaCookie) throw new Error('login did not issue a cookie');

    const hers = (await (
      await fetch(`${baseUrl}/api/student/dashboard`, { headers: { cookie: priyaCookie } })
    ).json()) as { recent: { id: string }[]; totals: { attempts: number } };

    const mineIds = new Set(mine.recent.map((attempt) => attempt.id));
    if (hers.recent.some((attempt) => mineIds.has(attempt.id))) {
      throw new Error('dashboards overlap between students');
    }

    return `200 · ${mineIds.size} recent · 403 for admin`;
  });

  /* ------------------------------- Day 11 -------------------------------- */

  await check('GET /api/admin/analytics reports the platform charts', async () => {
    const res = await fetch(`${baseUrl}/api/admin/analytics?days=7`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      windowDays: number;
      students: { total: number; active: number; activeLearners: number };
      quizzes: { total: number; published: number; attempted: number; neverAttempted: number };
      attempts: {
        total: number;
        graded: number;
        passed: number;
        failed: number;
        expired: number;
        inProgress: number;
        passRate: number | null;
        averagePercentage: number | null;
        inWindow: number;
      };
      timeline: { date: string; attempts: number; registrations: number; label: string }[];
      quizPerformance: { attempts: number; averagePercentage: number | null }[];
      categories: { name: string; attempts: number }[];
    };

    if (body.windowDays !== 7) throw new Error(`window mismatch: ${body.windowDays}`);
    if (body.timeline.length !== 7) throw new Error('expected a seven-day window');

    const dates = body.timeline.map((point) => point.date);
    if (JSON.stringify([...dates].sort()) !== JSON.stringify(dates)) {
      throw new Error('the timeline must be chronological');
    }
    if (body.timeline.at(-1)?.date !== new Date().toISOString().slice(0, 10)) {
      throw new Error('the timeline must end today');
    }

    const { attempts } = body;
    if (
      attempts.passed + attempts.failed + attempts.expired + attempts.inProgress !==
      attempts.total
    ) {
      throw new Error('the status buckets do not add up to the attempts');
    }
    if (attempts.graded !== attempts.passed + attempts.failed) {
      throw new Error('graded must be passed + failed');
    }
    if (attempts.passRate != null && (attempts.passRate < 0 || attempts.passRate > 100)) {
      throw new Error(`pass rate out of range: ${attempts.passRate}`);
    }
    if (
      attempts.averagePercentage != null &&
      (attempts.averagePercentage < 0 || attempts.averagePercentage > 100)
    ) {
      throw new Error(`average out of range: ${attempts.averagePercentage}`);
    }

    const timelineAttempts = body.timeline.reduce((sum, point) => sum + point.attempts, 0);
    if (timelineAttempts !== attempts.inWindow) {
      throw new Error('the timeline total does not match attempts.inWindow');
    }

    if (body.quizzes.attempted + body.quizzes.neverAttempted !== body.quizzes.total) {
      throw new Error('attempted + neverAttempted must equal the quiz total');
    }

    const quizAttempts = body.quizPerformance.reduce((sum, row) => sum + row.attempts, 0);
    if (quizAttempts !== attempts.total) throw new Error('quiz rows do not sum to the attempts');

    const categoryAttempts = body.categories.reduce((sum, row) => sum + row.attempts, 0);
    if (categoryAttempts !== attempts.total)
      throw new Error('category rows do not sum to the attempts');
    if (body.categories.some((row) => row.name.length === 0)) {
      throw new Error('every category needs a name');
    }

    return `200 · ${attempts.total} attempts · pass ${attempts.passRate ?? '—'}% · ${body.categories.length} categories`;
  });

  await check('the analytics window is validated and admin-only', async () => {
    const bad = await fetch(`${baseUrl}/api/admin/analytics?days=365`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(bad, 422);

    const student = await fetch(`${baseUrl}/api/admin/analytics`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(student, 403);

    const anonymous = await fetch(`${baseUrl}/api/admin/analytics`);
    expectStatus(anonymous, 401);

    const ninety = await fetch(`${baseUrl}/api/admin/analytics?days=90`, {
      headers: { cookie: adminCookie },
    });
    expectStatus(ninety, 200);

    const body = (await ninety.json()) as { timeline: unknown[] };
    if (body.timeline.length !== 90) throw new Error('days=90 should return ninety buckets');

    return '422 for days=365 · 403 student · 401 anonymous · 90 buckets';
  });

  /* ------------------------------- Day 12 -------------------------------- */

  await check('GET /api/leaderboard ranks the students who finished a quiz', async () => {
    const res = await fetch(`${baseUrl}/api/leaderboard`, { headers: { cookie: studentCookie } });
    expectStatus(res, 200);

    const body = (await res.json()) as {
      metric: string;
      period: string;
      scope: { type: string; categoryId: string | null };
      entries: {
        rank: number;
        userId: string;
        name: string;
        averagePercentage: number;
        bestPercentage: number;
        attempts: number;
        quizzesCompleted: number;
        passed: number;
        failed: number;
        isCurrentUser: boolean;
        gapToNext: number;
      }[];
      currentUser: { rank: number; userId: string } | null;
      totals: { participants: number; attempts: number; quizzes: number };
    };

    if (body.metric !== 'average' || body.period !== 'all') throw new Error('unexpected defaults');
    if (body.scope.type !== 'overall' || body.scope.categoryId !== null) {
      throw new Error('the default scope should be overall');
    }
    if (body.entries.length === 0) throw new Error('expected at least one ranked student');
    if (body.totals.participants !== body.entries.length) throw new Error('participant mismatch');

    for (let index = 0; index < body.entries.length; index += 1) {
      const entry = body.entries[index]!;
      if (entry.passed + entry.failed !== entry.attempts)
        throw new Error('attempt counts disagree');
      if (entry.bestPercentage < entry.averagePercentage) throw new Error('best below average');

      const previous = body.entries[index - 1];
      if (previous) {
        if (previous.averagePercentage < entry.averagePercentage) {
          throw new Error('the board is not sorted by average');
        }
        if (entry.rank < previous.rank) throw new Error('ranks must not go backwards');
      }
    }

    // The e2e account has a graded attempt by now, so it is on the board.
    if (!body.currentUser) throw new Error('the caller should have a row');
    if (!body.entries.some((entry) => entry.isCurrentUser) && body.totals.participants <= 20) {
      throw new Error('the caller should be visible when the board is smaller than the page');
    }

    if (JSON.stringify(body).includes('@quiz.dev'))
      throw new Error('an email leaked into the board');

    return `200 · ${body.totals.participants} ranked · leader ${body.entries[0]?.averagePercentage}%`;
  });

  await check('the leaderboard carries the live category filter and honours it', async () => {
    const completed = await fetch(`${baseUrl}/api/leaderboard?metric=completed&period=week`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(completed, 200);

    const completedBody = (await completed.json()) as {
      metric: string;
      period: string;
      entries: { quizzesCompleted: number }[];
    };

    if (completedBody.metric !== 'completed' || completedBody.period !== 'week') {
      throw new Error('the metric/period echo is wrong');
    }

    for (let index = 1; index < completedBody.entries.length; index += 1) {
      if (
        (completedBody.entries[index - 1]?.quizzesCompleted ?? 0) <
        (completedBody.entries[index]?.quizzesCompleted ?? 0)
      ) {
        throw new Error('the completed board is not sorted');
      }
    }

    // The category filter comes with the board itself — read from the table, not
    // a list baked into the UI — so a category added later needs no deploy.
    const overall = await fetch(`${baseUrl}/api/leaderboard`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(overall, 200);

    const overallBody = (await overall.json()) as {
      categories: { id: string; name: string; attempts: number }[];
    };

    if (overallBody.categories.length === 0) throw new Error('expected seeded categories');
    const names = overallBody.categories.map((category) => category.name);
    if (JSON.stringify(names) !== JSON.stringify([...names].sort())) {
      throw new Error('categories should be ordered by name');
    }

    const category = overallBody.categories.find((entry) => entry.attempts > 0);
    if (!category) throw new Error('expected a category with graded attempts');

    const categoryId = category.id;

    const scoped = await fetch(`${baseUrl}/api/leaderboard?categoryId=${categoryId}`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(scoped, 200);

    const scopedBody = (await scoped.json()) as {
      scope: { type: string; categoryName: string | null };
    };

    if (scopedBody.scope.type !== 'category' || !scopedBody.scope.categoryName) {
      throw new Error('the category scope was not applied');
    }

    const invalid = await fetch(`${baseUrl}/api/leaderboard?metric=streak`, {
      headers: { cookie: studentCookie },
    });
    expectStatus(invalid, 422);

    const unknownCategory = await fetch(
      `${baseUrl}/api/leaderboard?categoryId=00000000-0000-4000-8000-000000000000`,
      { headers: { cookie: studentCookie } },
    );
    expectStatus(unknownCategory, 404);

    const anonymous = await fetch(`${baseUrl}/api/leaderboard`);
    expectStatus(anonymous, 401);

    return `200 · ${overallBody.categories.length} categories · ${scopedBody.scope.categoryName} · 422 · 404 · 401`;
  });

  /* ------------------------------- Day 13 -------------------------------- */

  await check('API responses carry the hardening headers', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expectStatus(res, 200);

    for (const header of [
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'x-request-id',
    ]) {
      if (!res.headers.get(header)) throw new Error(`missing ${header}`);
    }

    if (res.headers.get('cache-control') !== 'no-store') {
      throw new Error(`cache-control was ${res.headers.get('cache-control')}`);
    }

    if (res.headers.get('vary')?.includes('Cookie') !== true) {
      throw new Error('vary should name the session cookie');
    }

    return `200 · ${res.headers.get('x-content-type-options')} · no-store`;
  });

  await check('a foreign origin cannot drive a state-changing call', async () => {
    const blocked = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({ email: 'rahul@quiz.dev', password: 'Password123' }),
    });

    expectStatus(blocked, 403);
    const body = (await blocked.json()) as { error: { code: string } };

    if (body.error.code !== 'CROSS_ORIGIN_BLOCKED') throw new Error(body.error.code);

    // The same call from the app's own origin is fine.
    const allowed = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'x-forwarded-for': '203.0.113.12',
      },
      body: JSON.stringify({ email: 'priya@quiz.dev', password: 'Password123' }),
    });

    expectStatus(allowed, 200);

    return `403 CROSS_ORIGIN_BLOCKED · 200 from the app origin`;
  });

  await check('an oversized body is refused before it is parsed', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.13',
        // The server stops reading at the limit and closes; do not reuse the socket.
        connection: 'close',
      },
      body: JSON.stringify({ email: `${'a'.repeat(200_000)}@quiz.dev`, password: 'Password123' }),
    });

    expectStatus(res, 413);
    const body = (await res.json()) as { error: { code: string } };

    if (body.error.code !== 'PAYLOAD_TOO_LARGE') throw new Error(body.error.code);

    return '413 PAYLOAD_TOO_LARGE';
  });

  await check('repeated bad passwords are throttled', async () => {
    const ip = '203.0.113.20';
    const attempt = async (email: string, password: string, from = ip) =>
      fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': from },
        body: JSON.stringify({ email, password }),
      });

    // Ten guesses, each against a different account so only the address bucket
    // fills — the account guard is a separate (softer) rule.
    for (let index = 0; index < 10; index += 1) {
      expectStatus(await attempt(`nobody-${index}@quiz.dev`, 'WrongPassword1'), 401);
    }

    const blocked = await attempt('amit@quiz.dev', 'Password123');
    const body = (await blocked.json()) as { error?: { code?: string } };

    if (blocked.status !== 429 || body.error?.code !== 'RATE_LIMITED') {
      throw new Error(`expected 429 RATE_LIMITED, got ${blocked.status} ${body.error?.code}`);
    }
    if (!blocked.headers.get('retry-after')) throw new Error('missing Retry-After');

    // The same credentials from another address still work.
    expectStatus(await attempt('amit@quiz.dev', 'Password123', '203.0.113.21'), 200);

    return `10 × 401 · 429 RATE_LIMITED · Retry-After ${blocked.headers.get('retry-after')} · other address 200`;
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

  /* ------------------------------- Day 14 -------------------------------- */

  await check('GET /api/admin/system reports the deployment self-check', async () => {
    const res = await fetch(`${baseUrl}/api/admin/system`, { headers: { cookie: adminCookie } });

    expectStatus(res, 200);

    interface SystemBody {
      service: { name: string; runtime: string; nodeEnv: string; uptimeSeconds: number };
      database: {
        target: string;
        urlHint: string;
        connected: boolean;
        latencyMs: number | null;
        counts: { users: number; quizzes: number } | null;
      };
      settings: { authRateLimitMax: number; maxBodyBytes: number; trustedOrigins: string[] };
      summary: {
        verdict: string;
        pass: number;
        warn: number;
        fail: number;
        checks: { id: string; status: string; detail: string }[];
      };
    }

    const raw = await res.text();
    const body = JSON.parse(raw) as SystemBody;

    if (!['ready', 'attention', 'blocked'].includes(body.summary.verdict)) {
      throw new Error(`unexpected verdict ${body.summary.verdict}`);
    }
    if (body.summary.checks.length !== 8) {
      throw new Error(`expected 8 checks, got ${body.summary.checks.length}`);
    }
    if (!body.database.connected || !body.database.counts) {
      throw new Error('expected a connected database with counts');
    }
    if (body.database.counts.users < 2) throw new Error('expected the seeded accounts');
    if (body.settings.trustedOrigins.length < 1) throw new Error('no trusted origins reported');

    // Nothing secret may cross the wire, even to an administrator.
    for (const forbidden of ['authToken', 'jwtSecret', 'passwordHash', 'TURSO_AUTH_TOKEN']) {
      if (raw.includes(forbidden)) throw new Error(`response leaked ${forbidden}`);
    }

    if (res.headers.get('cache-control') !== 'no-store') throw new Error('response was cacheable');

    return `200 · ${body.summary.verdict} · ${body.summary.checks.length} checks · ${body.database.target}`;
  });

  await check('GET /api/admin/system is closed to students and anonymous callers', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.31',
      },
      body: JSON.stringify({ email: 'rahul@quiz.dev', password: 'Password123' }),
    });

    expectStatus(login, 200);
    const cookie = cookieFrom(login);

    expectStatus(await fetch(`${baseUrl}/api/admin/system`, { headers: { cookie } }), 403);
    expectStatus(await fetch(`${baseUrl}/api/admin/system`), 401);

    return '403 · FORBIDDEN · 401';
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
