# QuizPlatform

Quiz Management & Online Assessment Platform — a Turborepo monorepo with a **Next.js** web app,
a **Hono RPC** API and a **Drizzle ORM + Turso** database.

> **Status: Day 1 complete.** Workspace, typed API contract, Drizzle schema, migrations, seed data
> and an automated test suite are in place. Authentication (Day 2) is next.

---

## Stack

| Layer            | Choice                                 | Why                                                           |
| ---------------- | -------------------------------------- | ------------------------------------------------------------- |
| Monorepo         | Turborepo 2 + pnpm workspaces          | One task graph, cached `build` / `typecheck` / `test`         |
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

- Node.js **20.11+** (developed on 22)
- pnpm **10+** (`corepack enable pnpm`)

### 1. Install

```bash
pnpm install
```

### 2. Configure the environment

```bash
cp .env.example .env
```

Configuration is layered, highest precedence first:

1. variables already exported in the environment (CI / hosting platform)
2. `.env.local` — machine-specific overrides, gitignored
3. `.env` — shared configuration, gitignored

Check what the tooling would connect to at any time:

```bash
pnpm db:status
```

Without a Turso URL the database layer falls back to `.data/quizplatform.db` (gitignored) so the app
runs offline with the same schema, migrations and scripts.

#### Using Turso Cloud

Following the official Drizzle guide, [Get Started with Drizzle and Turso Cloud](https://orm.drizzle.team/docs/get-started/turso-new):

```bash
turso db create quizplatform
turso db show quizplatform --url          # libsql://quizplatform-<org>.turso.io
turso db tokens create quizplatform
```

```dotenv
TURSO_DATABASE_URL="libsql://quizplatform-<org>.turso.io"
TURSO_AUTH_TOKEN="eyJhbGciOi..."
```

`DATABASE_URL` is accepted as an alias for `TURSO_DATABASE_URL`. Tokens and URLs live only in
gitignored files; `.env.example` is the tracked template.

### 3. Create the schema and seed data

Drizzle Kit owns the schema workflow — there is no hand-written migration runner:

```bash
pnpm db:migrate     # drizzle-kit migrate  → apply packages/db/migrations
pnpm db:seed        # load demo users, categories, quizzes, questions, attempts
```

The same two commands work against the local file and Turso Cloud.

### 4. Run everything

```bash
pnpm dev
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

| Command            | Underlying             | Purpose                                                  |
| ------------------ | ---------------------- | -------------------------------------------------------- |
| `pnpm db:generate` | `drizzle-kit generate` | Create a SQL migration + snapshot from the schema        |
| `pnpm db:migrate`  | `drizzle-kit migrate`  | Apply pending migrations (local or Turso)                |
| `pnpm db:push`     | `drizzle-kit push`     | Push the schema directly — rapid prototyping only        |
| `pnpm db:pull`     | `drizzle-kit pull`     | Introspect an existing database into a schema            |
| `pnpm db:studio`   | `drizzle-kit studio`   | Browse data in Drizzle Studio                            |
| `pnpm db:status`   | `tsx src/status.ts`    | Resolved target, connectivity, row counts (uses Drizzle) |

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
│  │  ├─ src/env.ts            resolves Turso URL vs local file
│  │  ├─ src/seed.ts           rich demo dataset
│  │  ├─ src/status.ts         db:status diagnostic (Drizzle queries)
│  │  ├─ src/__tests__/        schema + seed integrity tests
│  │  └─ migrations/           drizzle-kit generated SQL (checked in)
│  └─ shared/                  Zod enums, contracts, scrypt helpers
├─ turbo.json                  task graph + caching
├─ pnpm-workspace.yaml         workspace globs + approved build scripts
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

| Command            | Scope      | Description                                     |
| ------------------ | ---------- | ----------------------------------------------- |
| `pnpm dev`         | root       | Run web + API together through Turbo            |
| `pnpm dev:web`     | root       | Web only                                        |
| `pnpm dev:api`     | root       | API only                                        |
| `pnpm build`       | root       | `next build` + API typecheck                    |
| `pnpm typecheck`   | root       | TypeScript across all four packages             |
| `pnpm test`        | root       | Vitest across shared, db and api                |
| `pnpm lint`        | root       | Alias of typecheck (ESLint arrives with Day 2)  |
| `pnpm format`      | root       | Prettier write                                  |
| `pnpm db:generate` | `@quiz/db` | Generate SQL from the Drizzle schema            |
| `pnpm db:migrate`  | `@quiz/db` | Apply migrations with drizzle-kit               |
| `pnpm db:push`     | `@quiz/db` | Push schema without migration files (dev)       |
| `pnpm db:pull`     | `@quiz/db` | Introspect an existing database                 |
| `pnpm db:seed`     | `@quiz/db` | Seed demo data (`-- --force` to reset)          |
| `pnpm db:status`   | `@quiz/db` | Resolved DB target, connectivity and row counts |
| `pnpm db:studio`   | `@quiz/db` | Open Drizzle Studio                             |
| `pnpm setup`       | root       | install + migrate + seed                        |

---

## Testing

```bash
pnpm test          # all workspaces through Turbo
pnpm --filter @quiz/db test
```

41 tests cover the scaffolding end to end:

**`@quiz/shared`** (8) — scrypt record format, unique salts, correct/wrong passwords, unicode
normalisation, fail-closed behaviour on corrupt hashes, and the seed credential contract.

**`@quiz/db`** (21) — migrations replayed from scratch with `drizzle-kit migrate`; all seven tables
and the uniqueness/lookup indexes; column defaults; millisecond timestamp precision; unique email,
slug and per-attempt answer constraints; quiz → questions/options/attempts/answers cascade;
category-with-quizzes protected by `restrict`; user deletion cascading while nulling the quiz author;
CLI behaviour for `migrate`, `status`, `seed`, skip-if-populated and `--force`; and seeded-data
integrity (quiz/question/option counts, one correct option each, attempt percentages consistent with
marks and pass thresholds, answers matching option correctness, unique password hashes, enough
history for the Day 10–12 dashboards).

**`@quiz/api`** (12) — service banner, health payload shape, request IDs, security headers, CORS
allow/deny, the DB readiness probe with live counts, credential-free URL hints, the 503 envelope when
the database is unreachable, `/api/meta` roadmap, and the 404 error envelope.

API tests run against a throwaway database created by the real toolchain (`drizzle-kit migrate`
followed by the seed script), so they exercise the same SQL that ships.

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
| `TURSO_DATABASE_URL` | prod     | local fallback file     | db, api, drizzle-kit      |
| `DATABASE_URL`       | —        | —                       | alias for the above       |
| `TURSO_AUTH_TOKEN`   | Turso    | —                       | db, api, drizzle-kit      |
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

**`/api/health/db` returns 503** — the API is up but the database is unreachable. Run
`pnpm db:status` for the resolved target and cause, then `pnpm db:migrate`.

**`no such table: users`** — migrations were not applied. Run `pnpm db:migrate`, then `pnpm db:seed`.

**`Please provide required params for 'turso' dialect`** — `TURSO_AUTH_TOKEN` is missing for a
`libsql://` URL.

**`TURSO_DATABASE_URL is required in production`** — the local file fallback is dev-only by design.

**`pnpm db:status` says `fetch failed`** — the machine cannot reach Turso. Turso requires HTTPS to
`*.turso.io` on port 443; restricted/sandboxed networks often block it. Run migrations from a network
that can reach Turso, or point the URL at a local file for offline work.

**Preview host blocks the request** — `next.config.ts` lists `*.e2b.app` in `allowedDevOrigins`. Add
your own preview domain there if it differs.

**Port already in use** — stop the other process or set `API_PORT` in `.env` and point
`API_INTERNAL_URL` at the new port.
