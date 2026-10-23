# QuizPlatform

Quiz Management & Online Assessment Platform — a Turborepo monorepo with a **Next.js** web app,
a **Hono RPC** API and a **Drizzle ORM + Turso** database.

> **Status: Day 1 complete.** Workspace, typed API contract, Drizzle schema, migrations, seed data
> and an automated test suite are in place. Authentication (Day 2) is next.

---

## Stack

| Layer            | Choice                                 | Why                                                           |
| ---------------- | -------------------------------------- | ------------------------------------------------------------- |
| Monorepo         | Turborepo 2 + Bun workspaces           | One task graph, cached `build` / `typecheck` / `test`         |
| Web              | Next.js 16 (App Router) + React 19     | Server components, file routing, fast builds                  |
| Styling          | Tailwind CSS v4 + shadcn/ui primitives | Design tokens in CSS, accessible components, dark-first theme |
| API              | Hono 4 on `@hono/node-server`          | Tiny, fast, and **end-to-end typed RPC** via `AppType`        |
| Database         | Drizzle ORM + libSQL / Turso           | Typed schema, Drizzle Kit migrations, local + cloud parity    |
| Validation       | Zod 4 (`@quiz/shared`)                 | One contract reused by API and UI                             |
| Password hashing | Node `scrypt` (`@quiz/shared/crypto`)  | Ready for Day 2 auth, no native dependencies                  |
| Tests            | Vitest 5                               | Fast, TypeScript-native, no extra config                      |

---

## Architecture

```
┌──────────────────────────┐        ┌───────────────────────────┐
│  Browser                 │        │  Next.js server (RSC)     │
│  client component        │        │  rewrite /api/*           │
│  hc<AppType>('/api')     │───────▶│  API_INTERNAL_URL         │
└──────────────────────────┘        └─────────────┬─────────────┘
                                                  │ HTTP
                                                  ▼
                                    ┌───────────────────────────┐
                                    │  Hono API (:3001)         │
                                    │  /api/health, /api/meta   │
                                    │  exports AppType          │
                                    └─────────────┬─────────────┘
                                                  │ Drizzle ORM
                                                  ▼
                                    ┌───────────────────────────┐
                                    │  libSQL                   │
                                    │  Turso Cloud (remote)     │
                                    │  or .data/*.db (local)    │
                                    └───────────────────────────┘
```

Browser requests go to the **same origin** (`/api/*`), then Next proxies them to Hono. That keeps
httpOnly auth cookies first-party and removes CORS from the critical path.

The RPC client is typed from the API's exported `AppType`:

```ts
// apps/web/src/lib/api.ts
import type { AppType } from '@quiz/api';
import { hc } from 'hono/client';

export const client = hc<AppType>('');

const res = await client.api.health.db.$get();
const { counts } = (await res.json()) as DatabaseStatus;
```

Add a route in `apps/api/src/app.ts` and the client gains it automatically. No codegen step.

---

## Getting started

### Prerequisites

- **Bun 1.1+** — package manager and workspace runtime (`curl -fsSL https://bun.sh/install | bash`)
- Node.js **20.11+** — Next.js and tsx run on Node (developed on 22)

### 1. Install

```bash
bun install
```

Bun workspaces are declared in `package.json` (`workspaces`) and locked by `bun.lock`, which is
committed. `.env.example` is the only tracked env file.

> Prefer pnpm or npm? Change `packageManager` in the root `package.json` and add a
> `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']`. Turbo follows whichever package
> manager the field names, so nothing else needs to change.

### 2. Configure the environment

```bash
cp .env.example .env
```

Configuration is layered, highest precedence first:

1. variables already exported in the environment (CI / hosting platform)
2. `.env.local` — machine-specific overrides, gitignored
3. `.env` — shared configuration, gitignored

#### Turso Cloud is the database

The app always talks to **Turso Cloud**, following the official Drizzle guide
[Get Started with Drizzle and Turso Cloud](https://orm.drizzle.team/docs/get-started/turso-new).
There is no local fallback: if the credentials are missing the API exits with setup instructions
instead of silently switching databases.

```bash
turso db create quizplatform
turso db show quizplatform --url          # libsql://quizplatform-<org>.turso.io
turso db tokens create quizplatform
```

```dotenv
TURSO_DATABASE_URL="libsql://quizplatform-<org>.turso.io"
TURSO_AUTH_TOKEN="eyJhbGciOi..."
```

`DATABASE_URL` is accepted as an alias for `TURSO_DATABASE_URL`. Credentials live only in gitignored
files; `.env.example` is the tracked template. `TURSO_AUTH_TOKEN` is mandatory for a `libsql://` URL
and the config validates that before connecting.

### 3. Apply the schema (you run this)

Credentials and migrations are **not** included in the repository — `.env` is gitignored and never
committed. Once you have added your Turso URL and token:

```bash
bun run db:migrate     # drizzle-kit migrate → apply packages/db/migrations to Turso Cloud
bun run db:seed        # optional: load demo users, categories, quizzes, questions, attempts
```

Drizzle Kit owns the schema workflow — there is no hand-written migration runner.

### 4. Run everything

```bash
bun dev
```

| Service   | URL                                 |
| --------- | ----------------------------------- |
| Web       | http://localhost:3000               |
| API       | http://localhost:3001               |
| Health    | http://localhost:3000/api/health    |
| DB probe  | http://localhost:3000/api/health/db |
| API index | http://localhost:3000/api/meta      |

### Demo accounts

| Role    | Email          | Password    |
| ------- | -------------- | ----------- |
| Admin   | admin@quiz.dev | Admin12345  |
| Student | rahul@quiz.dev | Password123 |
| Student | priya@quiz.dev | Password123 |
| Student | amit@quiz.dev  | Password123 |

Each account is hashed with `scrypt` and its own salt, so Day 2's login route can verify them
directly.

---

## Database workflow (Drizzle Kit)

Schema changes live in `packages/db/src/schema.ts`; migrations are generated, never hand-written:

| Command               | Underlying             | Purpose                                           |
| --------------------- | ---------------------- | ------------------------------------------------- |
| `bun run db:generate` | `drizzle-kit generate` | Create a SQL migration + snapshot from the schema |
| `bun run db:migrate`  | `drizzle-kit migrate`  | Apply pending migrations to Turso Cloud           |
| `bun run db:push`     | `drizzle-kit push`     | Push the schema directly — rapid prototyping only |
| `bun run db:studio`   | `drizzle-kit studio`   | Browse data in Drizzle Studio                     |
| `bun run db:seed`     | `tsx src/seed.ts`      | Load the demo dataset (optional)                  |

`db:generate` works without credentials — it only diffs the TypeScript schema against the migration
snapshots. Every other database command requires a valid `TURSO_DATABASE_URL` and
`TURSO_AUTH_TOKEN` and fails with setup instructions if they are missing.

`db:push` is intentionally interactive: drizzle-kit lists the DDL it is about to run and asks for
confirmation, because a push can drop data. In CI/non-TTY contexts run
`cd packages/db && bunx drizzle-kit push --force` instead.

Extra arguments are forwarded to the underlying script, e.g. `bun run db:seed --force`. The scripts
call `bun run --filter`, so if you switch package managers, update the five `db:*` entries in the
root `package.json` as well.

The client follows the documented pattern — Drizzle creates and owns the libSQL connection:

```ts
// packages/db/src/index.ts
const instance = drizzle({
  connection: { url, authToken },
  schema,
  casing: 'snake_case',
});
```

`drizzle.config.ts` selects `dialect: 'turso'` for `libsql://` URLs and `dialect: 'sqlite'` for the
local `file:` fallback, with `dbCredentials: { url, authToken }` exactly as the guide shows.

---

## Project layout

```
quizplatform/
├─ apps/
│  ├─ api/                     Hono API (port 3001)
│  │  ├─ src/app.ts            chained routes → exported AppType
│  │  ├─ src/routes/health.ts  liveness + database readiness (Drizzle $count)
│  │  ├─ src/routes/meta.ts    API index / roadmap
│  │  ├─ src/__tests__/        Vitest suite + test-database setup
│  │  └─ src/lib/              env parsing, error envelope
│  └─ web/                     Next.js app (port 3000)
│     ├─ src/app/              layout, landing page, globals.css
│     ├─ src/components/ui/    shadcn/ui primitives (button, card, badge)
│     ├─ src/components/       layout sections + live status panel
│     ├─ src/lib/api.ts        hc<AppType> RPC client
│     └─ next.config.ts        /api/* rewrite + workspace transpilation
├─ packages/
│  ├─ db/                      Drizzle schema, migrations, seed
│  │  ├─ src/schema.ts         7 tables + relations
│  │  ├─ src/index.ts          drizzle({ connection }) client
│  │  ├─ src/env.ts            Turso Cloud URL + token resolution
│  │  ├─ src/seed.ts           rich demo dataset
│  │  ├─ src/__tests__/        schema + seed integrity tests
│  │  └─ migrations/           drizzle-kit generated SQL (checked in)
│  ├─ shared/                  Zod enums, contracts, scrypt helpers
│  └─ test-utils/              package-manager-agnostic test runner helper
├─ turbo.json                  task graph + caching
├─ package.json                 workspaces + trustedDependencies (Bun)
└─ .env.example                credential template
```

---

## Database schema

Seven tables, defined in `packages/db/src/schema.ts`:

| Table        | Purpose                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `users`      | Both roles (`ADMIN`, `STUDENT`), status, scrypt password hash                                       |
| `categories` | Quiz categories (unique name + slug)                                                                |
| `quizzes`    | Metadata, category FK, duration, passing score, max attempts, `DRAFT` / `PUBLISHED` / `UNPUBLISHED` |
| `questions`  | Belongs to a quiz, marks, difficulty, explanation, display position                                 |
| `options`    | Belongs to a question, `is_correct` flag, display position                                          |
| `attempts`   | One row per try: score, percentage, pass/fail, **server-enforced `expires_at`**                     |
| `answers`    | Selected option per question, graded `is_correct` (unique per attempt + question)                   |

Relationship chain: `users → attempts → quizzes → questions → options`, with `answers` joining an
attempt to the question it answered. Indexes cover the foreign keys, status and difficulty columns
that dashboards and listings will query.

Design notes:

- Timestamps are `integer` milliseconds (`timestamp_ms`) — compact and timezone-safe on SQLite.
- `attempts.expires_at` is stored so the API, not the browser, decides when a quiz is over.
- `answers.is_correct` is nullable while an attempt is `IN_PROGRESS`; the backend grades on submit.
- Quiz-scoped child rows cascade on delete; `quizzes.category_id` is `restrict` so a category with
  quizzes cannot be silently removed.

---

## Scripts

Scripts run through Turbo; `bun <script>` and `bun run <script>` are equivalent.

| Command               | Scope      | Description                                     |
| --------------------- | ---------- | ----------------------------------------------- |
| `bun dev`             | root       | Run web + API together through Turbo            |
| `bun run dev:web`     | root       | Web only                                        |
| `bun run dev:api`     | root       | API only                                        |
| `bun run build`       | root       | `next build` + API typecheck                    |
| `bun run typecheck`   | root       | TypeScript across every package                 |
| `bun run test`        | root       | Vitest across shared, db and api                |
| `bun run lint`        | root       | Alias of typecheck (ESLint arrives with Day 2)  |
| `bun run format`      | root       | Prettier write                                  |
| `bun run db:generate` | `@quiz/db` | Generate SQL migrations from the Drizzle schema |
| `bun run db:migrate`  | `@quiz/db` | Apply pending migrations with drizzle-kit       |
| `bun run db:push`     | `@quiz/db` | Push schema without migration files (dev)       |
| `bun run db:studio`   | `@quiz/db` | Open Drizzle Studio                             |
| `bun run db:seed`     | `@quiz/db` | Seed demo data (`-- --force` to reset)          |

> Use `bun run <script>` for scripts. Bare `bun test` launches Bun's own test runner instead of the
> Vitest suites, which is not what this repo uses.

---

## Testing

```bash
bun run test                    # all workspaces through Turbo
bun run test --filter=@quiz/db  # one package
```

42 tests cover the scaffolding end to end:

**`@quiz/shared`** (8) — scrypt record format, unique salts, correct/wrong passwords, unicode
normalisation, fail-closed behaviour on corrupt hashes, and the seed credential contract.

**`@quiz/db`** (22) — migrations replayed from scratch with `drizzle-kit migrate`; all seven tables
and the uniqueness/lookup indexes; column defaults; millisecond timestamp precision; unique email,
slug and per-attempt answer constraints; quiz → questions/options/attempts/answers cascade;
category-with-quizzes protected by `restrict`; user deletion cascading while nulling the quiz author;
CLI behaviour for `migrate`, `seed`, skip-if-populated and `--force`; root-script wiring (arg
forwarding and credential-free `generate`); and seeded-data
integrity (quiz/question/option counts, one correct option each, attempt percentages consistent with
marks and pass thresholds, answers matching option correctness, unique password hashes, enough
history for the Day 10–12 dashboards).

**`@quiz/api`** (12) — service banner, health payload shape, request IDs, security headers, CORS
allow/deny, the DB readiness probe with live counts, credential-free URL hints, the 503 envelope when
the database is unreachable, `/api/meta` roadmap, and the 404 error envelope.

Tests never touch the cloud database: each suite creates a throwaway `file:` database in a temp
directory using the real toolchain (`drizzle-kit migrate` followed by the seed script), so the same
SQL that ships is what gets verified. The Turso-only rule applies to the running application.

---

## API surface (Day 1)

| Method | Path             | Description                                       |
| ------ | ---------------- | ------------------------------------------------- |
| GET    | `/api`           | Service banner                                    |
| GET    | `/api/health`    | Liveness: version, runtime, uptime                |
| GET    | `/api/health/db` | Readiness: target, latency, live row counts       |
| GET    | `/api/meta`      | API index + the spec's remaining endpoint roadmap |

Responses use a consistent error envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "No route matches GET /api/nope" } }
```

Security defaults already applied: `secureHeaders`, request IDs, CORS restricted to the web origin,
pretty-printed JSON outside production, and a Zod-backed env schema that fails fast on bad config.

---

## Environment variables

| Variable             | Required | Default                 | Used by                   |
| -------------------- | -------- | ----------------------- | ------------------------- |
| `TURSO_DATABASE_URL` | yes      | —                       | db, api, drizzle-kit      |
| `TURSO_AUTH_TOKEN`   | yes      | —                       | db, api, drizzle-kit      |
| `DATABASE_URL`       | no       | —                       | alias for the URL above   |
| `API_PORT`           | no       | `3001`                  | api                       |
| `API_INTERNAL_URL`   | no       | `http://localhost:3001` | web rewrite target        |
| `WEB_ORIGIN`         | no       | `http://localhost:3000` | API CORS origin           |
| `JWT_SECRET`         | Day 2    | —                       | reserved for auth cookies |

---

## Roadmap

Day 1 (done): monorepo, API, Drizzle schema, migrations, seed, env config, tests.

| Day | Milestone                                                      |
| --- | -------------------------------------------------------------- |
| 2   | Authentication — register, login, logout, hashing, JWT cookies |
| 3   | Role-based authorization — admin/student guards                |
| 4   | Admin dashboard — stats, user management                       |
| 5   | Quiz management — CRUD + publish/unpublish                     |
| 6   | Categories & questions — CRUD, options, correct answers        |
| 7   | Student quiz UI — listing, details, navigation, timer          |
| 8   | Submission & scoring — server-side grading, expiry enforcement |
| 9   | Results & answer review, attempt history                       |
| 10  | Student dashboard & performance charts                         |
| 11  | Admin analytics                                                |
| 12  | Leaderboard                                                    |
| 13  | Testing & security hardening                                   |
| 14  | Deployment & docs                                              |

---

## Troubleshooting

**`/api/health/db` returns 503** — the API is up but the database is unreachable. The response's
`details.reason` carries the underlying driver error (`fetch failed → ECONNRESET`, missing
credentials, …).

**`no such table: users`** — migrations were not applied. Run `bun run db:migrate`, then `bun run db:seed`.

**`Please provide required params for 'turso' dialect`** — `TURSO_AUTH_TOKEN` is missing for a
`libsql://` URL.

**`Unable to find package manager binary: cannot find binary path`** — Turbo reads `packageManager`
from the root `package.json`. This repo pins `bun@…`; install Bun (or update the field to match the
package manager you use).

**`TURSO_DATABASE_URL is not set`** — every database command (and the readiness probe) needs Turso
credentials; copy `.env.example` to `.env` and fill in the URL and token from the Turso dashboard.
`bun run db:generate` still works, since it never connects.

**`fetch failed` / `ECONNRESET` when running `bun run db:migrate`** — the machine cannot reach Turso.
Turso needs HTTPS to `*.turso.io` on port 443, and restricted networks reset those connections. Run
the migration from a machine with normal internet access.

**Preview host blocks the request** — `next.config.ts` lists `*.e2b.app` in `allowedDevOrigins`. Add
your own preview domain there if it differs.

**Port already in use** — stop the other process or set `API_PORT` in `.env` and point
`API_INTERNAL_URL` at the new port.

**Browser console: “module factory is not available” / stale chunk errors** — chunks on disk changed
under a running dev server (usually after reinstalling dependencies). Stop the server, delete
`apps/web/.next`, restart, and hard-reload the page.
