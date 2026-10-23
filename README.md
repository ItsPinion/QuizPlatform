# QuizPlatform

Quiz Management & Online Assessment Platform — a Turborepo monorepo with a **Next.js** web app,
a **Hono RPC** API and a **Drizzle + Turso (libSQL)** database.

> **Status: Day 1 of the 14-day build plan is complete.**
> The workspace, typed API contract, database schema, migrations and seed data are in place.
> Authentication (Day 2) is next.

---

## Stack

| Layer            | Choice                                 | Why                                                                 |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Monorepo         | Turborepo 2 + pnpm workspaces          | One task graph, cached `build` / `typecheck`, shared tooling        |
| Web              | Next.js 16 (App Router) + React 19     | Server components, file routing, fast builds                        |
| Styling          | Tailwind CSS v4 + shadcn/ui primitives | Design tokens in CSS, accessible components, dark-first theme       |
| API              | Hono 4 on `@hono/node-server`          | Tiny, fast, and **end-to-end typed RPC** via `AppType`              |
| Database         | Drizzle ORM + libSQL / Turso           | Typed schema, checked-in SQL migrations, works locally and remotely |
| Validation       | Zod 4 (`@quiz/shared`)                 | One contract reused by API and UI                                   |
| Password hashing | Node `scrypt` (`@quiz/shared/crypto`)  | Available for Day 2 auth, no native dependencies                    |

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
                                    │  Turso (remote)           │
                                    │  or .data/*.db (local)    │
                                    └───────────────────────────┘
```

Requests from the browser go to the **same origin** (`/api/*`), then Next proxies them to the Hono
server. That keeps httpOnly auth cookies first-party and removes CORS from the critical path.

The RPC client is imported from `@quiz/api`'s exported `AppType`:

```ts
// apps/web/src/lib/api.ts
import type { AppType } from '@quiz/api';
import { hc } from 'hono/client';

export const client = hc<AppType>('');

// fully typed — path, params, request body and response
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

The app runs **without Turso credentials**: with no `DATABASE_URL`, the database layer falls back to
`.data/quizplatform.db` (gitignored) using the same schema and migrations.

Configuration is layered, highest precedence first:

1. variables already exported in the environment (CI / hosting platform)
2. `.env.local` — machine-specific overrides, gitignored
3. `.env` — shared configuration, gitignored

Check what the CLI would connect to at any time:

```bash
pnpm db:status
```

#### Using Turso (recommended for the real setup)

```bash
# one-off
turso db create quizplatform
turso db show quizplatform --url          # libsql://quizplatform-<org>.turso.io
turso db tokens create quizplatform       # paste into .env
```

Then set both values in `.env`:

```dotenv
DATABASE_URL="libsql://quizplatform-<org>.turso.io"
TURSO_AUTH_TOKEN="eyJhbGciOi..."
```

> Never commit `.env` — it is gitignored, and only `.env.example` is tracked.

### 3. Create the schema and seed data

```bash
pnpm db:migrate     # apply packages/db/migrations to the configured database
pnpm db:seed        # demo users, categories, quizzes, questions, attempts
```

Migrations work identically against a local file and a remote Turso database. Verify the target
first with `pnpm db:status` — it reports the resolved database, whether a token is present, row
counts, and a clear cause when the connection fails.

To regenerate migrations after editing `packages/db/src/schema.ts`:

```bash
pnpm db:generate
```

To wipe and re-seed:

```bash
pnpm db:seed -- --force
```

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

Seeded with `pnpm db:seed`:

| Role    | Email          | Password    |
| ------- | -------------- | ----------- |
| Admin   | admin@quiz.dev | Admin12345  |
| Student | rahul@quiz.dev | Password123 |
| Student | priya@quiz.dev | Password123 |
| Student | amit@quiz.dev  | Password123 |

The credential hashes are produced with `scrypt` via `@quiz/shared/crypto`, so Day 2's login route
can verify them directly.

---

## Project layout

```
quizplatform/
├─ apps/
│  ├─ api/                     Hono API (port 3001)
│  │  ├─ src/app.ts            chained routes → exported AppType
│  │  ├─ src/routes/health.ts  liveness + database readiness probes
│  │  ├─ src/routes/meta.ts    API index / roadmap
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
│  │  ├─ src/env.ts            resolves Turso vs local file
│  │  ├─ src/migrate.ts        migration runner
│  │  ├─ src/seed.ts           rich demo dataset
│  │  └─ migrations/           generated SQL (checked in)
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
- Every quiz-scoped child row uses `onDelete: 'cascade'`; `quizzes.category_id` is `restrict` so a
  category with quizzes cannot be silently removed.

---

## Scripts

| Command            | Scope      | Description                                     |
| ------------------ | ---------- | ----------------------------------------------- |
| `pnpm dev`         | root       | Run web + API together through Turbo            |
| `pnpm dev:web`     | root       | Web only                                        |
| `pnpm dev:api`     | root       | API only                                        |
| `pnpm build`       | root       | `next build` + API typecheck                    |
| `pnpm typecheck`   | root       | TypeScript across all four packages             |
| `pnpm lint`        | root       | Alias of typecheck (ESLint arrives with Day 2)  |
| `pnpm format`      | root       | Prettier write                                  |
| `pnpm db:generate` | `@quiz/db` | Generate SQL from the Drizzle schema            |
| `pnpm db:migrate`  | `@quiz/db` | Apply migrations                                |
| `pnpm db:push`     | `@quiz/db` | Push schema without migration files (dev)       |
| `pnpm db:seed`     | `@quiz/db` | Seed demo data (`-- --force` to reset)          |
| `pnpm db:status`   | `@quiz/db` | Resolved DB target, connectivity and row counts |
| `pnpm db:studio`   | `@quiz/db` | Open Drizzle Studio                             |
| `pnpm setup`       | root       | install + migrate + seed                        |

---

## API surface (Day 1)

| Method | Path             | Description                                       |
| ------ | ---------------- | ------------------------------------------------- |
| GET    | `/api`           | Service banner (also served at `/api/`)           |
| GET    | `/api/health`    | Liveness: version, runtime, uptime                |
| GET    | `/api/health/db` | Readiness: target, latency, live row counts       |
| GET    | `/api/meta`      | API index + the spec's remaining endpoint roadmap |

Every response uses a consistent error envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "No route matches GET /api/nope" } }
```

Security defaults already applied: `secureHeaders`, request IDs, CORS restricted to the web origin,
pretty-printed JSON outside production, and a Zod-backed env schema that fails fast on bad config.

---

## Environment variables

| Variable           | Required | Default                 | Used by                   |
| ------------------ | -------- | ----------------------- | ------------------------- |
| `DATABASE_URL`     | prod     | local fallback file     | db, api                   |
| `TURSO_AUTH_TOKEN` | Turso    | —                       | db, api                   |
| `API_PORT`         | no       | `3001`                  | api                       |
| `API_INTERNAL_URL` | no       | `http://localhost:3001` | web rewrite target        |
| `WEB_ORIGIN`       | no       | `http://localhost:3000` | API CORS origin           |
| `JWT_SECRET`       | Day 2    | —                       | reserved for auth cookies |

---

## Roadmap

Day 1 (done): monorepo, API, database schema, migrations, seed, env config.

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
`pnpm db:migrate` (local) or check `DATABASE_URL` / `TURSO_AUTH_TOKEN`.

**`no such table: users`** — migrations were not applied. Run `pnpm db:migrate`, then `pnpm db:seed`.

**`DATABASE_URL is required in production`** — the local file fallback is dev-only by design.

**`pnpm db:status` says `fetch failed`** — the machine cannot reach Turso. Turso requires HTTPS to
`*.turso.io` on port 443; restricted/sandboxed networks often block it. Run the migration from a
network that can reach Turso, or point `DATABASE_URL` at a local file for offline work.

**Preview host blocks the request** — `next.config.ts` lists `*.e2b.app` in `allowedDevOrigins`. Add
your own preview domain there if it differs.

**Port already in use** — stop the other process or set `API_PORT` in `.env` and point
`API_INTERNAL_URL` at the new port.
