# QuizPlatform

Quiz Management & Online Assessment Platform — a Turborepo monorepo with a **Next.js** web app,
a **Hono RPC** API and a **Drizzle ORM + Turso** database.

> **Status: Day 14 complete — feature complete.** Workspace, typed API contract, Drizzle schema, migrations, seed data,
> authentication (register / login / logout / `/me`, scrypt hashes, httpOnly JWT cookies), role-scoped
> API namespaces, guarded `/admin` + `/student` areas, an admin console with dashboard statistics,
> user management, quiz management with a guarded publish/unpublish lifecycle, category CRUD,
> question authoring, the student quiz interface, server-side submission and scoring — manual or
> automatic at the deadline, idempotent, with the whole result stored on the attempt — results:
> a per-question answer review with the key and the explanations, plus a filterable attempt history,
> a student dashboard (the spec's six statistics, a score trend, category averages and a
> fourteen-day activity chart) and an admin analytics screen: attempts and registrations over time,
> the pass/fail split, and the most popular quizzes and categories over a selectable window, then
> the leaderboard: overall and per-category boards ranked by average score, best score or quizzes
> completed, over all time, this month or this week, with competition ranking and the caller's own
> position always resolved — and a hardening pass: rate-limited sign-ins that cannot lock the real
> owner out, a same-origin guard on every write, scoped JWTs, a body-size cap, `no-store` and a CSP —
> with an adversarial suite that attacks each of the nine areas the spec names — and, last, a
> deployment that can be checked rather than remembered: eight environment rules with one verdict,
> a redacted system screen an operator can read, a `bun run deploy:check` gate that runs the same
> rules locally and eight live probes against a real URL, one Dockerfile with two targets, and the
> runbook for migrate, verify and roll back.
> **1,086 automated tests, a 77-check end-to-end smoke run and a 216-probe spec audit.** Feature complete: all fourteen days shipped.

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
| Password hashing | Node `scrypt` (`@quiz/shared/crypto`)  | Per-user salt, deterministic verification, no native build    |
| Tests            | Vitest 5                               | Fast, TypeScript-native, no extra config                      |

---

## Architecture

```
┌──────────────────────────┐        ┌───────────────────────────┐
│  Browser                 │        │  Next.js server (RSC)     │
│  client component        │        │  rewrite /api/*           │
│  hc<AppType>('/api')     │───────▶│  /admin · /student guards │
└──────────────────────────┘        └─────────────┬─────────────┘
                                                  │ HTTP (cookie forwarded)
                                                  ▼
                                    ┌───────────────────────────┐
                                    │  Hono API (:3001)         │
                                    │  /api/auth/*              │
                                    │  /api/admin/*   requireAdmin
                                    │  /api/student/* requireStudent
                                    │  /api/health · /api/meta  │
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
httpOnly auth cookies first-party and removes CORS from the critical path. Server components read the
same cookie, forward it to `/api/auth/me`, and guard `/admin` + `/student` before rendering — see
[`docs/authorization.md`](docs/authorization.md).

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

Bun workspaces are declared in `package.json` (`workspaces`). `bun.lock` is **gitignored** — like
`package-lock.json`, it is regenerated by `bun install` — and the `packageManager` field pins the Bun
version. `.env.example` is the only tracked env file.

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
| Sign in   | http://localhost:3000/login         |
| Admin     | http://localhost:3000/admin         |
| Student   | http://localhost:3000/student       |
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

Each account is stored as a `scrypt` hash with its own salt and signs in through
`POST /api/auth/login` — the plaintext above exists only in this documentation and the seed script.
The admin lands in `/admin` and students in `/student`; opening the other area redirects to the one
your role owns.

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
│  │  ├─ src/routes/auth.ts    register / login / logout / me
│  │  ├─ src/routes/admin.ts   ADMIN-only namespace (requireAdmin) + stats & users
│  │  ├─ src/routes/admin-quizzes.ts  quiz CRUD + publish/unpublish, same guard
│  │  ├─ src/routes/student.ts STUDENT-only namespace (requireStudent)
│  │  ├─ src/routes/health.ts  liveness + database readiness (Drizzle $count)
│  │  ├─ src/routes/meta.ts    API index / roadmap
│  │  ├─ src/middleware/       requireAuth + requireRole guards
│  │  ├─ src/lib/admin-stats.ts  dashboard aggregates (one query per section)
│  │  ├─ src/lib/leaderboard.ts  one aggregate per board, ranks in TS
│  │  ├─ src/lib/rate-limit.ts   fixed windows: address = hard, account = soft
│  │  ├─ src/middleware/origin.ts  CSRF guard for state-changing requests
│  │  ├─ src/lib/admin-users.ts  directory query + guarded role/status writes
│  │  ├─ src/lib/admin-quizzes.ts  quiz CRUD, derived slugs, lifecycle rules
│  │  ├─ src/lib/system-status.ts  redacted self-report for /api/admin/system
│  │  ├─ src/lib/landing.ts     the landing payload: counts, samples, demo block
│  │  ├─ src/lib/auth.ts       JWT signing, session cookie, claim mapping
│  │  ├─ src/__tests__/        Vitest suite + test-database setup
│  │  └─ src/lib/              env parsing, error envelope
│  └─ web/                     Next.js app (port 3000)
│     ├─ src/app/              landing, /login, /register, /admin, /student
│     ├─ src/app/admin/        layout · overview · analytics · users · quizzes · system · profile
│     ├─ src/app/student/      dashboard · quizzes · attempt/[id] · results · review · leaderboard
│     ├─ src/lib/session.ts    server-side session lookup (cookie → API)
│     ├─ src/lib/api-server.ts cookie-forwarding RPC client for admin pages
│     ├─ src/lib/guards.ts     role decision used by the protected pages
│     ├─ src/lib/admin-params.ts  filter ⇄ URL mapping for the user directory
│     ├─ src/lib/dashboard-params.ts  labels, deltas and bar widths for the dashboard
│     ├─ src/lib/analytics-params.ts  window parsing, change copy, caption helpers
│     ├─ src/lib/leaderboard-params.ts  metric/period filters, ranks, gaps, hrefs
│     ├─ src/lib/security-headers.ts    CSP + hardening headers, tested without Next
│     ├─ src/lib/deployment-params.ts   verdict/status/runtime labels for /admin/system
│     ├─ src/lib/landing.ts   server-side /api/landing fetch, Zod-validated
│     ├─ src/components/question-form.tsx   the four-format authoring form
│     ├─ src/components/score-trend-chart.tsx  server-rendered SVG trend line
│     ├─ src/components/activity-chart.tsx     fourteen-day CSS bar chart
│     ├─ src/components/category-breakdown.tsx per-category averages
│     ├─ src/components/analytics-timeline.tsx attempts + registrations chart
│     ├─ src/components/pass-fail-chart.tsx    the stacked pass/fail split
│     ├─ src/components/quiz-performance-chart.tsx  popular quizzes + average scores
│     ├─ src/components/category-popularity.tsx     popular categories
│     ├─ src/components/leaderboard-board.tsx       the ranked table
│     ├─ src/components/leaderboard-podium.tsx      the top three
│     ├─ src/lib/quiz-params.ts   quiz filters, badge tones, lifecycle hints
│     ├─ src/lib/redirect.ts   validated ?next= (no open redirects)
│     ├─ src/components/brand/      the mark — a Q: a ring and a detached dot
│     ├─ src/components/music-toggle.tsx  Web Audio reading-room ambience
│     ├─ src/components/auth/     shell, 56px fields, password reveal, caps-lock notice
│     ├─ src/lib/auth-params.ts  password rules, strength, role labels, demo copy
│     ├─ src/components/landing/  hero · atmosphere · library scene · live status · bento · tour · CTA
│     ├─ src/components/nav/        the bar: active pill, scroll progress, mobile drawer
│     ├─ src/lib/nav-sections.ts    active-link and active-section rules
│     ├─ src/lib/use-session.ts     one shared /api/auth/me for the whole header
│     ├─ src/components/       footer, the two auth forms
│     ├─ src/components/ui/    shadcn/ui primitives (button, card, badge, input, label, bento)
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
│  ├─ shared/                  Zod enums and every contract: auth, admin, quiz, question, attempts, dashboard, analytics, leaderboard, deployment
│  └─ test-utils/              package-manager-agnostic test runner helper
├─ docs/
│  ├─ admin-dashboard.md       stats definitions, directory API, console rules
│  ├─ quiz-management.md       CRUD, slugs, lifecycle rules, screens
│  ├─ categories-and-questions.md  category CRUD, question authoring, option rules
│  ├─ question-formats.md      the four formats: schema, contracts, grader, screens, import
│  ├─ student-quiz-interface.md  catalogue, attempt lifecycle, the taker, timer rules
│  ├─ submission-and-scoring.md  grading rules, lazy expiry, idempotency, result card
│  ├─ results-and-review.md      the key release rule, verdicts, history, screens
│  ├─ student-dashboard.md       statistic definitions, aggregates, chart geometry, screens
│  ├─ admin-analytics.md         windows, definitions, queries, the cross-user sweep, charts
│  ├─ leaderboard.md            metrics, periods, ranking rules, the screen, tests
│  ├─ security.md               threat model, controls, rate limits, CSP, trade-offs
│  ├─ deployment.md            env matrix, the eight checks, deploy order, rollback, runbook
│  ├─ ui.md                    the bento surface: primitives, motion rules, what was left out
│  ├─ authorization.md         role model, guards, redirect rules, failure modes
│  └─ testing.md               test inventory, manual QA, security trade-offs
├─ scripts/
│  ├─ e2e-smoke.ts             boots the real API and walks every flow
│  ├─ spec-audit.ts            the spec, section by section, against a running app
│  └─ deploy-check.ts          the deployment gate (env rules · live probes)
├─ Dockerfile                  deps → build → api / web runtime stages
├─ turbo.json                  task graph + caching
├─ package.json                 workspaces + trustedDependencies (Bun)
└─ .env.example                credential template
```

---

## Database schema

Seven tables, defined in `packages/db/src/schema.ts`:

| Table        | Purpose                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `users`      | Both roles (`ADMIN`, `STUDENT`), status, scrypt password hash                                               |
| `categories` | Quiz categories — unique name, unique slug, and a `lower(name)` index so "Rust" and "rust" collide          |
| `quizzes`    | Metadata, category FK, duration, passing score, max attempts, `DRAFT` / `PUBLISHED` / `UNPUBLISHED`         |
| `questions`  | Belongs to a quiz, `type`, marks, difficulty, explanation, image/code, display position                     |
| `options`    | Belongs to a question, `is_correct` flag, display position — the answer key for a fill-in-the-blank         |
| `attempts`   | One row per try: score, percentage, pass/fail, **server-enforced `expires_at`**                             |
| `answers`    | Selected option, option set or typed text per question, graded `is_correct` (unique per attempt + question) |

Relationship chain: `users → attempts → quizzes → questions → options`, with `answers` joining an
attempt to the question it answered. Indexes cover the foreign keys, status and difficulty columns
that dashboards and listings will query.

Design notes:

- Timestamps are `integer` milliseconds (`timestamp_ms`) — compact and timezone-safe on SQLite.
- `attempts.expires_at` is stored so the API, not the browser, decides when a quiz is over.
- `answers.is_correct` is nullable while an attempt is `IN_PROGRESS`; the backend grades on submit.
- Quiz-scoped child rows cascade on delete; `quizzes.category_id` is `restrict` so a category with
  quizzes cannot be silently removed.
- `categories.name` is stored exactly as typed but indexed twice: `unique(slug)`, `unique(name)` and
  `unique(lower(name))`. The last one is what makes the typeahead's case-insensitive "find or
  create" safe against two admins submitting the same new name at once.

---

## Scripts

Scripts run through Turbo; `bun <script>` and `bun run <script>` are equivalent.

| Command                | Scope      | Description                                          |
| ---------------------- | ---------- | ---------------------------------------------------- |
| `bun dev`              | root       | Run web + API together through Turbo                 |
| `bun run dev:web`      | root       | Web only                                             |
| `bun run dev:api`      | root       | API only                                             |
| `bun run build`        | root       | `next build` + API typecheck                         |
| `bun run typecheck`    | root       | TypeScript across every package                      |
| `bun run test`         | root       | Vitest across shared, db, api and web                |
| `bun run test:e2e`     | root       | Real HTTP smoke run against a throwaway DB           |
| `bun run test:spec`    | root       | 191 spec-section probes against a running app        |
| `bun run deploy:check` | root       | Deployment gate: env rules, or live probes (`--url`) |
| `bun run lint`         | root       | Alias of typecheck (ESLint is not wired up yet)      |
| `bun run format`       | root       | Prettier write                                       |
| `bun run db:generate`  | `@quiz/db` | Generate SQL migrations from the Drizzle schema      |
| `bun run db:migrate`   | `@quiz/db` | Apply pending migrations with drizzle-kit            |
| `bun run db:push`      | `@quiz/db` | Push schema without migration files (dev)            |
| `bun run db:studio`    | `@quiz/db` | Open Drizzle Studio                                  |
| `bun run db:seed`      | `@quiz/db` | Seed demo data (`-- --force` to reset)               |

> Use `bun run <script>` for scripts. Bare `bun test` launches Bun's own test runner instead of the
> Vitest suites, which is not what this repo uses.

---

## Testing

```bash
bun run test                    # 1,086 tests, all workspaces through Turbo
bun run test --filter=@quiz/api # one package
bun run test:e2e                # 77 checks against a live server + throwaway DB
bun run test:spec               # 216 probes, one per spec promise (needs both servers up)
bun run deploy:check            # the deployment gate (see docs/deployment.md)
```

**1,086 tests** cover the scaffolding, authentication, authorization, the admin console, content authoring, quiz taking, grading, review, dashboards and analytics:

**`@quiz/shared`** (386) — scrypt record format, unique salts, correct/wrong passwords, unicode
normalisation, fail-closed behaviour on corrupt hashes, the seed credential contract, and the Zod
auth contracts (trimming, lowercased emails, stripped unknown keys, the exact password policy,
session constants), plus the Day 4 admin contracts: query coercion and defaults, the
`updateUserSchema` refine that rejects an empty body while stripping fields the dashboard must
never write, the credential-free user row shape, and the stats/list response schemas. Day 14 adds the
deployment gate (`deployment.test.ts`, 22): each of the eight environment rules in both production and
development, every verdict path (a warning never outranks a failure), the fixed check order, and the
summary arithmetic behind `5 of 6 checks pass · 1 warning`. `landing.test.ts` (16) covers the landing
payload schema, the range and duration labels (`15–25 min`, `60–70%`, `57.1%`) and the headline-number
derivation the page renders.

**`@quiz/db`** (63) — migrations replayed from scratch with `drizzle-kit migrate`; all seven tables
and the uniqueness/lookup indexes; column defaults; millisecond timestamp precision; unique email,
slug and per-attempt answer constraints; quiz → questions/options/attempts/answers cascade;
category-with-quizzes protected by `restrict`; user deletion cascading while nulling the quiz author;
CLI behaviour for `migrate`, `seed`, skip-if-populated and `--force`; root-script wiring (arg
forwarding and credential-free `generate`); and seeded-data
integrity (quiz/question/option counts, the per-format key rules, attempt percentages consistent with
marks and pass thresholds, answers matching option correctness, unique password hashes, enough
history for the Day 10–12 dashboards).

**`@quiz/api`** (355) — service banner, health payload shape, request IDs, security headers, CORS
allow/deny, the DB readiness probe with live counts, credential-free URL hints, the 503 envelope when
the database is unreachable, `/api/meta` roadmap, and the 404 error envelope. Day 14 adds the system
report: the schema-validated document, counts that match the tables, checks that are honest about a
`file:` database, no secret anywhere in the payload, the limits matching what is enforced, and
`401`/`403` on the guard. `landing.test.ts` (13) covers the public payload: counts that match the
tables, the bank split by question format (adding up to the total), a sample question with no answer
key, a graded result with no student, demo accounts filtered against the users table, and an
empty-but-valid document when the database cannot be read.

`question-formats.test.ts` (15) is §10 end to end through the HTTP app: a true/false pair written by
the server, a multiple-answer key stored in full, an accepted-answer list where every entry is
correct, a format change refused with `422 QUESTION_TYPE_IMMUTABLE`, one CSV writing all four
formats, a running paper that ships the type and the media but no key (and no options at all for a
fill-in-the-blank), the wrong answer shape for each format refused, a mixed paper graded and broken
down by format, the review with the typed answer against the accepted list, and the administrator's
copy of the same attempt — typed answer, ticked set and `null` for a skipped question — reading the
grader's stored verdict rather than re-deriving it.

Authentication adds: registration (hash stored, distinct salt per user, cookie issued, email
normalised, role escalation ignored, duplicate → 409 even when only the casing differs, weak or
over-long password → 422, malformed/missing JSON → 400), login against the seeded admin and student
plus wrong-password/unknown-email parity, inactive accounts, `/me` with cookie and Bearer,
tampered/expired/foreign-signed tokens, deleted and deactivated users, logout clearing the cookie,
and the `requireRole` guard (allow, 403, 401).

Day 5 adds 44 API tests: the directory (search, status/difficulty/category filters, both sorts,
pagination, cleared filters, 422s), joined aggregates that do not fan out, creation with derived and
de-duplicated slugs, the full validation matrix, partial updates that keep their other columns and
their slug, the publish/unpublish lifecycle including both 409s and idempotent republishing, deletion
with cascade for untouched quizzes and `QUIZ_HAS_ATTEMPTS` for attempted ones.

Day 6 adds 31 more. Categories: list and detail, create plus the idempotent re-create under a
different casing, rename with a stable slug, re-casing a category's own name, `409 CATEGORY_EXISTS`
against a sibling, description set/clear, empty body → 422, deletion blocked by
`CATEGORY_HAS_QUIZZES` until the quizzes are gone. Questions: ordered reads that assert exactly one
correct option per question, append semantics, the option-set validation matrix, option
reconciliation by id (`OPTION_HAS_ANSWERS` when a picked option is dropped, `OPTION_NOT_FOUND` for a
foreign id), delete rules (`QUESTION_HAS_ANSWERS`, `QUIZ_WOULD_HAVE_NO_QUESTIONS`), whole-list
reordering and its mismatch case, and publishing the moment a question exists.

Category resolution adds eight more: a typed name that matches an existing category reuses it in any
casing ("javascript" → "JavaScript"), an unknown name is created and used in the same request, a new
name that differs only by internal whitespace collapses to the existing row, `POST
/api/admin/categories` answers `201 created` then `200 created: false` on the repeat, sending both
`categoryId` and `categoryName` is rejected, sending neither is rejected, an unknown `categoryId` is
still `422 CATEGORY_NOT_FOUND`, and `PATCH` can move a quiz to a brand-new category by name alone.

Day 8 adds 8 API tests: start → answer → submit over the API with stored counts and `is_correct`
stamps, wrong and cleared answers, an idempotent retry that returns the original `completedAt`, an
auto-submit after the deadline (with the `ATTEMPT_EXPIRED` → `ATTEMPT_NOT_ACTIVE` transition), the
lazy sweep that grades a stale attempt behind a catalogue read, no answer key in either payload,
owner-only access and the admin 403. The shared package adds 20 — the grading matrix, weighted marks, two-decimal rounding, the exact
pass boundary, the empty paper, duration maths, auto-submit detection and a graded attempt session
that must carry its result.

Day 9 adds 11 API tests: a full answer review over HTTP for a hand-built correct / wrong / blank
paper (verdicts, a key per format, explanations, earned marks summing to the stored score), the
`409` that keeps the key away from a running attempt, owner-only and admin refusals, history scoping
and totals, status/quiz filters, score sorting, pagination, the sweep that settles a timed-out
attempt before listing it, and the query-validation matrix. The shared package adds 13 (verdict
splitting, earned marks, tallies, filter matching, both wire schemas and their limits) and the web
package 16 (review and history parameter parsing with href round-trips, verdict labels and tones,
marks and selection copy, and the history timestamp formatter).

Day 10 adds 12 API tests: the totals checked against hand-inserted rows, every range and `null` case,
the trend's chronological order and twelve-point cap, category attempts summing to passed + failed,
the fourteen-day window ending today, recent rows newest-first and capped at five, a fresh submission
appearing on the next call, a live attempt moving no average, a timed-out attempt settled with
`autoSubmitted` before the numbers are read, scoping between two students, 403 for an admin and 401
for an anonymous caller, and an empty student answering zeroes with `null` averages. The shared
package adds 29 — average/pass-rate/streak edges, duration formatting, UTC day keys, zero-filled
activity buckets, chart geometry (single point, flat line, 0–100 clamp) and the dashboard schema
bounds — and the web package 16 presentation helpers (percent and coverage labels, streak and
activity captions, trend deltas, bar widths). The db package adds one: every seeded student must own
at least one attempt inside the dashboard's fourteen-day window, so a fresh seed fills the activity
chart instead of drawing a flat line.

Day 11 adds 12 API tests: every aggregate checked against direct queries (students, quizzes,
questions, attempts, learners), the status buckets adding up and every rate in range, the timeline's
length, order and today anchor with its total matching `inWindow`, all four windows plus a `422` for
`days=365`, quiz rows summing to the attempts and ordered by popularity, categories covering every row
— quiet ones included — with their quiz counts, a new attempt counted on the next request, an
`IN_PROGRESS` row moving no average, a timed-out paper settled by the cross-user sweep before it is
counted, registrations landing in today's bucket, the previous window kept separate, and 401/403. The
shared package adds 32 — window parsing, zero-filled buckets, window totals, ratio slices that sum to
100 with expired attempts kept apart, bar/series scaling and both schemas — and the web package 16
window and caption helpers.

Day 13 adds 51 API tests in one adversarial file, grouped by the nine areas the spec names:
authentication (no plaintext stored or returned, unknown emails answering exactly like wrong passwords,
a foreign `aud` and a foreign `iss` refused, `alg: none` refused, the cookie's flags and `no-store`),
authorization (every admin read refused to a student and every student read refused to an admin, a
token that claims `ADMIN` for a `STUDENT` row still refused, a self-registration asking for `ADMIN`
stored as `STUDENT`), quiz creation (server-owned fields ignored, five invalid shapes rejected, a
`<script>` title persisted verbatim as data), attempts (cross-student read/write/submit/review all
`404`, drafts unseen, a double start resuming instead of spending a try, a foreign question id
refused, no key in the live paper), the timer (a client-supplied deadline ignored, a late write `409`,
a late submit graded with `autoSubmitted` and a clamped duration), scoring (a posted `score: 999`
ignored, stored results agreeing with the paper), validation (malformed JSON, wrong content type,
unknown route, the 422 envelope without stack frames, malformed ids, a 200 KB body `413`),
unauthorized access (thirteen protected endpoints `401`, a foreign origin `403`, the app origin and a
preview host allowed, reads untouched, every response `no-store` with `Vary: Cookie`), input validation
(SQL metacharacters as an email and as a search term, an XSS category name round-tripped as data,
password policy, a wrongly-typed payload) and the new rate limiter (bucket arithmetic with an injected
clock, per-key isolation, a hard address block with `Retry-After`, a soft account block that never
locks the owner out, registration capped). The web package adds 8 tests for the header policy — CSP
directives, no `unsafe-eval` in production, the preview allowance on `frame-ancestors`, HSTS only in
production, and the deliberate absence of `X-Frame-Options`.

Day 12 adds 14 API tests: the overall board checked against every student's own aggregates, sorted
and ranged, with no email in the payload; the caller's row and rank resolved beyond the visible slice;
the best and completed boards; a controlled tie fixture (two 88s share rank 1, the next row is rank 3
with an 18-point gap); the category scope and its `404`; rolling week and month windows bounded on
`completed_at`; in-progress attempts invisible to the board; a new graded attempt ranked immediately;
the validation matrix; both roles admitted, anonymous refused; the category filter checked row-for-row
against the categories table with its live attempt counts; and a category created mid-test appearing
instantly with `attempts: 0`. The shared package adds 26 — metric values, sorting by each metric with
its tie-breakers, competition ranks and gaps in both units, `buildLeaderboard` (current-user marking,
pass rates, an empty board), rolling period starts, `topPercentOf`, and the query/payload schemas
including the category options — and the web package 18 filter, label, ordinal, gap-wording and
caption helpers.

Day 4 adds 30 API tests: statistics arithmetic that agrees with the database, the pass-rate range,
the newest-five strips, live reflection of a new account, directory filters (role, status, name and
email search, empty values, unknown roles), pagination, both sorts, 422s for bad queries, detail
lookups, 404/422 handling, promotion/demotion, deactivation lockout and restoration, `SELF_LOCKOUT`
for self-demotion and self-deactivation, and 401/403 on every admin route.

**`@quiz/web`** (282) — the error-envelope narrowing every auth form relies on (API error codes,
Zod issue extraction, fallbacks for malformed bodies, network-error mapping), the Day 3 page guard
rules, the Day 4 directory parameters, the Day 5 quiz helpers, the Day 6 question-form helpers, and
the Day 7–9 student helpers: catalogue filter parsing with `toStudentQuery`/`quizzesHref` round-trips
(including refusing to emit a value the parser would drop), start state and button labels, attempts
and best-score labels, clock text for sighted and screen-reader use, progress percentages, timer
tones, result presentation (percentage formatting, pass/fail headline and badge tone, the marks line,
the auto-submit note and the time-taken clock), and the review/history view helpers (filter parsing,
href round-trips, verdict labels and tones, marks and selection copy, history timestamps), and the
dashboard/analytics view helpers (percent and coverage labels, trend deltas, bar widths, analytics
window parsing and href round-trips, change wording and tones, outcome labels and the timeline's
screen-reader summary), plus the Day 14 deployment helpers: verdict and status labels and tones,
runtime and latency formatting, the counts line with its no-counts fallback, the actionable-check
filter and host shortening, and the auth-screen helpers: the three password rules and their progress
states, role labels, the per-screen live stats, the role home and the demo fill announcement.
`logo-geometry.test.ts` covers the mark as numbers: the ink fits the 32-unit grid with a margin, its
centre is the grid's centre, the tail floats clear of the ring rather than joining it, and the stroke
stays heavy enough for a 16px favicon and light enough for a poster. `hero-params.test.ts` covers the
landing page's two calls to action: a visitor is asked to sign up, a
student is sent to the catalogue, an administrator to the console, and neither signed-in role is ever
pointed at `/login`. `nav-sections.test.ts` covers the bar: segment-aware active matching
(`/student` covers `/student/results` but not `/stud`), longest-match wins, the landing-page scroll
spy's ordering, and the role → area map.

Beyond Vitest, `bun run test:e2e` boots the real API process against a throwaway database and walks
the whole auth flow, the admin console, content authoring, quiz taking, grading and review over HTTP
(77 checks, including cookie flags, a tampered-cookie replay, both role denials, dashboard aggregates,
filtered user listing, a promote/demote round trip, `SELF_LOCKOUT`, a deactivation lockout, quiz
creation, slug stability across a rename, the publish rules, the delete rules, category
create/rename/delete, question authoring, reordering, `PUT` with retained option ids, the
last-question guard, the published-only catalogue, start/resume, a payload with no answer key, an
answer round-trip, a cross-student 404, submitting and grading over HTTP, an idempotent retry, a
locked write after grading, the catalogue reflecting the stored score, the released answer key, the
`409` guarding a live attempt, the history and its filters, a cross-student review `404`, the dashboard statistics over HTTP, the
dashboard's 401/403 and cross-student scoping, the platform analytics payload with its invariants, and
the analytics window validation plus both refusals, the leaderboard's ordering and count
invariants, no email leak, metric/period/category handling and its `422`/`404`/`401`, the hardening
headers on the wire, a foreign origin blocked while the app origin passes, a `413` for an oversized
body, a `429` with `Retry-After` after ten bad passwords, and the admin system report with its eight
checks and no leaked secret). See
[`docs/testing.md`](docs/testing.md) for the full inventory, a manual QA checklist and the known
security trade-offs.

Session tests sign their own JWTs with the same helpers the API uses, so expiry and forgery paths
are exercised for real rather than mocked.

Tests never touch the cloud database: the API suite builds `.data/test-api.db` (and the smoke run
`.data/e2e-<pid>.db`) with the real toolchain — `drizzle-kit migrate` followed by the seed script — so
the same SQL that ships is what gets verified. Both files are gitignored and removed after the run.
The Turso-only rule applies to the running application, not to tests.

---

## API surface (Day 14)

| Method | Path                                            | Description                                            |
| ------ | ----------------------------------------------- | ------------------------------------------------------ |
| GET    | `/`                                             | Service banner: name, version, endpoint index          |
| GET    | `/api/health`                                   | Liveness: version, runtime, uptime                     |
| GET    | `/api/health/db`                                | Readiness: target, latency, live row counts            |
| GET    | `/api/meta`                                     | API index + the spec's remaining endpoint roadmap      |
| GET    | `/api/landing`                                  | Public landing-page data: counts, samples, demo logins |
| POST   | `/api/auth/register`                            | Create a STUDENT account, sign in, set the cookie      |
| POST   | `/api/auth/login`                               | Exchange email + password for a session cookie         |
| POST   | `/api/auth/logout`                              | Clear the session cookie (idempotent)                  |
| GET    | `/api/auth/me`                                  | Current user + session expiry (requires a session)     |
| GET    | `/api/admin/stats`                              | Dashboard aggregates + newest accounts and attempts    |
| GET    | `/api/admin/analytics`                          | Platform charts over a 7/14/30/90-day window           |
| GET    | `/api/admin/system`                             | Deployment self-report: checks, database, limits       |
| GET    | `/api/admin/users`                              | Paged, filtered, sorted user directory                 |
| GET    | `/api/admin/users/:id`                          | One user with attempt statistics                       |
| PATCH  | `/api/admin/users/:id`                          | Change a role and/or status                            |
| GET    | `/api/admin/categories`                         | Category list + quiz counts (feeds the typeahead)      |
| POST   | `/api/admin/categories`                         | Find-or-create a category by name (201 / 200)          |
| GET    | `/api/admin/categories/:id`                     | One category + the quizzes filed under it              |
| PATCH  | `/api/admin/categories/:id`                     | Rename / re-describe; the slug stays stable            |
| DELETE | `/api/admin/categories/:id`                     | Delete — only while no quizzes are filed under it      |
| GET    | `/api/admin/quizzes`                            | Paged, filtered, sorted quiz directory                 |
| POST   | `/api/admin/quizzes`                            | Create a quiz — always starts as `DRAFT`               |
| GET    | `/api/admin/quizzes/:id`                        | One quiz with question and attempt counts              |
| PATCH  | `/api/admin/quizzes/:id`                        | Edit a quiz; the slug stays stable                     |
| DELETE | `/api/admin/quizzes/:id`                        | Delete a quiz that has no attempts                     |
| GET    | `/api/admin/quizzes/:id/questions`              | A quiz's questions, ordered, each with its options     |
| POST   | `/api/admin/quizzes/:id/questions`              | Author a question, in any of the four formats          |
| PATCH  | `/api/admin/quizzes/:id/questions/order`        | Reorder a quiz's questions as a whole list             |
| GET    | `/api/admin/questions/:id`                      | One question with its options and answer count         |
| PUT    | `/api/admin/questions/:id`                      | Replace a question; options reconcile by id            |
| DELETE | `/api/admin/questions/:id`                      | Delete an unanswered question                          |
| POST   | `/api/admin/quizzes/:id/publish`                | Publish — needs at least one question                  |
| POST   | `/api/admin/quizzes/:id/unpublish`              | Take a published quiz offline                          |
| GET    | `/api/student/categories`                       | Categories that hold at least one published quiz       |
| GET    | `/api/student/quizzes`                          | Published catalogue + the caller's attempt state       |
| GET    | `/api/student/quizzes/:id`                      | One quiz + whether this student can start it           |
| POST   | `/api/student/quizzes/:id/start`                | Start an attempt, or resume the one in flight          |
| GET    | `/api/student/attempts/:id`                     | Questions, saved answers, remaining time               |
| PUT    | `/api/student/attempts/:id/answers/:questionId` | Save or clear one answer                               |
| GET    | `/api/student/dashboard`                        | Statistics, trend, categories, activity, recent        |
| GET    | `/api/leaderboard`                              | Ranked students by metric, period and category         |
| GET    | `/api/student/attempts`                         | Paged attempt history with scores and counts           |
| GET    | `/api/student/attempts/:id/review`              | The answer key, only once the attempt is finished      |
| POST   | `/api/student/attempts/:id/submit`              | Grade the paper — manual or at the deadline            |

Responses use a consistent error envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "No route matches GET /api/nope" } }
```

Security defaults already applied: `secureHeaders`, request IDs, CORS restricted to the web origin,
pretty-printed JSON outside production, and a Zod-backed env schema that fails fast on bad config.

---

## The landing page (live data)

`apps/web/src/app/page.tsx` is a `force-dynamic` server component that calls
`GET /api/landing` once per request, validates the response against
`landingPayloadSchema`, and hands slices of it to seven presentation blocks — hero, numbers, bento,
**formats**, tour, call to action, footer. The formats block draws its labels from
`@quiz/shared/question-type` and its numbers from `SELECT type, count(*)` in the same request, so the
page cannot advertise a format the platform does not grade, or a count the bank does not hold.

**Nothing on the page is typed by hand.** The version badge, the four headline counts, the duration
range, the pass-mark range, the sample question, the graded paper behind the hero, the console chart,
the demo logins: all of it comes from the payload. The components contain copy and layout, no facts.

`GET /api/landing` is public and `no-store`. It answers with:

| Field               | Contents                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `service`           | name, version, runtime, `NODE_ENV`, uptime — the same values `/api/health` reports                       |
| `database`          | `target`, redacted `urlHint`, `connected`, `latencyMs`                                                   |
| `counts`            | users, categories, quizzes, published quizzes, questions, attempts, graded, passed, pass rate, average % |
| `shape`             | the published catalogue's min/max/average duration, pass mark and question count                         |
| `categories`        | name, total quizzes, published quizzes — drives the console shot                                         |
| `quizzes`           | **published only**: title, category, difficulty, duration, pass mark, attempt limit, questions           |
| `formats`           | questions per format, in enum order, zeros included — the landing page's four-format block               |
| `sampleQuestion`    | the first question of the fullest published quiz — text, marks, options. **No key, no explanation**      |
| `sampleResult`      | one graded attempt: marks, counts, percentage, pass flag, time taken. **No user, no join**               |
| `demo`              | the seeded accounts **that exist in the users table**, or `enabled: false` when `DEMO_ACCOUNTS=0`        |
| `unavailableReason` | `null`, or why the database could not be read                                                            |

Three decisions keep it safe:

- **The projection decides what can leak.** `pickQuestion` selects option text and position only, so
  `isCorrect` is not in the object to forget to strip. `pickResult` queries attempts without touching
  `users`. A smoke check asserts the serialised body contains no `isCorrect`, `explanation`,
  `selectedOptionId`, `passwordHash`, and no `@` outside the demo block.
- **It answers when the database does not.** The route catches, logs, and returns 200 with zeroes,
  `database.connected: false` and an `unavailableReason` (`emptyLandingPayload`). The page then shows
  its empty states and a thin warning bar — an honest blank, never an invented quiz.
- **Demo logins are verified, not asserted.** `resolveDemoAccounts` intersects the seed fixture with
  the actual `users` rows, so a reseeded or renamed database advertises nothing that does not work;
  `DEMO_ACCOUNTS=0` hides the block entirely for a real deployment.

The hero's two buttons come from `lib/hero-params.ts` and depend on the session: a visitor gets
**Get started** (→ `/register`), a student gets **Take a quiz** (→ `/student/quizzes`), an
administrator gets **Open the console** (→ `/admin`). Nothing on the page asks a signed-in person to
sign in again, and the header's **My dashboard** button is the only filled button in the bar.

The header is one thin band on every page (`components/cinema/nav.tsx`): Platform, Formats, Tour and
Docs in the smallest type on the page, the current one white with an `aria-current="page"` rule that
follows the landing section you have scrolled to, transparent over the hero until the page moves.
Below `lg` the links move into a drawer that traps Tab, closes on Escape and restores focus. One
`/api/auth/me` is shared by the bar, the account menu and the drawer. See
[`docs/ui.md`](docs/ui.md) §8.

The page also has a visual language beyond the data: a hand-drawn pixel bookshelf
(`library-scene.tsx`), an ambient layer of aurora blobs, stars and rising dust (`atmosphere.tsx`),
glowing borders and light sweeps, and a **Music** button in the header that synthesises a reading-room
drone with Web Audio — off by default, never autoplayed, remembered once you turn it on. All of it is
decorative, `aria-hidden`, compositor-only, and switched off under `prefers-reduced-motion`. See
[`docs/ui.md`](docs/ui.md) §7.

The hero's live pill starts from the server's snapshot and then polls `/api/health/db` once a minute,
so the counts move while the page is open. On failure it keeps the last snapshot and labels itself
`stale`. `bun run deploy:check --url …` probes `/api/landing` too — a deployment whose landing data
is broken is a deployment whose front page lies.

---

## Authentication (Day 2)

The API issues a **signed JWT in an httpOnly cookie** — no token ever touches JavaScript, and no
session table has to be read on every request.

| Concern          | Choice                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Password storage | scrypt (`N=16384, r=8, p=1`, 64-byte key, random 16-byte salt)                           |
| Token            | HS256 JWT: `sub`, `email`, `role`, `iat`, `exp`                                          |
| Transport        | `quiz_session` cookie — `HttpOnly`, `SameSite=Lax`, `Secure` in production, 7-day expiry |
| Also accepted    | `Authorization: Bearer <jwt>` (curl, tests, future native clients)                       |
| Signing key      | `JWT_SECRET`; production refuses to boot without it                                      |

**Flow.** `POST /api/auth/register` hashes the password, forces `role = STUDENT` (a `role` field in
the payload is ignored, never trusted), inserts the user and returns `201` with the cookie already
set. `POST /api/auth/login` verifies the hash, refuses `INACTIVE` accounts with `403`, and sets the
cookie. `GET /api/auth/me` re-reads the user row behind the token, so a deleted or deactivated
account loses access immediately instead of when its token expires. `POST /api/auth/logout` clears
the cookie on the same path.

**Error codes.**

| Status | Code                  | Meaning                                              |
| ------ | --------------------- | ---------------------------------------------------- |
| 400    | `INVALID_JSON`        | Body is not valid JSON                               |
| 401    | `UNAUTHENTICATED`     | No cookie / Bearer token on a protected route        |
| 401    | `INVALID_SESSION`     | Signature bad, expired, or the user is gone          |
| 401    | `INVALID_CREDENTIALS` | Wrong email **or** password — deliberately identical |
| 403    | `ACCOUNT_INACTIVE`    | Correct password, but the account is disabled        |
| 409    | `EMAIL_TAKEN`         | Email already registered                             |
| 422    | `VALIDATION_ERROR`    | Zod issues in `details`                              |

Unknown emails still run a decoy scrypt verification, so login timing does not reveal which
addresses exist. In the browser, `/login` and `/register` post through the Next.js `/api/*` rewrite,
keeping the cookie first-party; the header swaps to the signed-in user, their role and a sign-out
button.

### The two screens

`/login` and `/register` share `components/auth/auth-shell.tsx`: a story column built from
`/api/landing` (papers graded, categories, quizzes open — the argument for signing in) beside a form
card with the largest type in the app. The form is first in the DOM and first on a phone.

| Affordance        | Detail                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Fields            | 56px tall, 16px text — no iOS zoom, comfortable thumb target. Always a visible `<label for>`. |
| Autofill          | `autocomplete="email" / "current-password" / "new-password" / "name"` on every input.         |
| Password reveal   | A 44×44 `<button aria-pressed>`, named "Show password" / "Hide password".                     |
| Caps Lock         | Detected with `getModifierState`, attached through `aria-describedby`.                        |
| Errors            | `role="alert"`, focus moved to the offending field, `aria-invalid` set on it.                 |
| Register strength | The three server rules, live: a `role="progressbar"`, "met / not met yet" per rule.           |
| Skip link         | "Skip to the form", visible on focus, because the sticky header sits above it.                |
| Demo logins       | Read from `/api/landing`, one button fills the form — it never submits for you.               |

Sign-in goes to `?next=` when the URL asked for somewhere, otherwise to the role's home
(`/admin` or `/student`). Registration lands in `/student/quizzes`, not an empty dashboard.
`bun run deploy:check --url …` asserts the sign-in screen still serves labelled fields, the skip
link and autofill hints.

Guards live in `apps/api/src/middleware/auth.ts`: `requireAuth` (session → user row),
`requireRole(...roles)`, and the composed `requireAdmin` / `requireStudent` used by the Day 3
namespaces.

---

## Authorization (Day 3)

Full details — guard internals, the scope descriptor, redirect rules and every failure mode — are in
[`docs/authorization.md`](docs/authorization.md).

Two role-scoped namespaces, both guarded at the moment a request enters the router:

```
/api/admin/*    →  requireAdmin    (auth + role ADMIN)
/api/student/*  →  requireStudent  (auth + role STUDENT)
```

`apps/api/src/middleware/auth.ts` exposes four guards: `requireAuth`, `requireRole(...roles)`,
`requireAdmin` and `requireStudent`. The namespaced guards authenticate **and** check the role in a
single middleware, so a route added under `/api/admin` in Day 4+ cannot ship without a role check —
the guard is registered on the router (`adminRoutes.use('*', requireAdmin)`), not per handler.

Roles are **exclusive**: an admin calling `/api/student/access` gets `403`, and a student calling
`/api/admin/access` gets `403`. Both endpoints answer with a scope descriptor:

```json
{
  "scope": "ADMIN",
  "user": { "id": "…", "name": "Alex Admin", "role": "ADMIN", "status": "ACTIVE", "…": "…" },
  "permissions": [
    "quizzes:manage",
    "questions:manage",
    "categories:manage",
    "users:manage",
    "analytics:read"
  ]
}
```

| Status | Code               | When                                                 |
| ------ | ------------------ | ---------------------------------------------------- |
| 401    | `UNAUTHENTICATED`  | No session cookie or Bearer token                    |
| 401    | `INVALID_SESSION`  | Bad signature, expired, or the user no longer exists |
| 403    | `ACCOUNT_INACTIVE` | Valid session, but the account is disabled           |
| 403    | `FORBIDDEN`        | Signed in with the wrong role for this namespace     |

Guards run **before** route matching, so an unknown path under `/api/admin` answers `401`/`403` to
callers who should not be there and `404` to an authorised one — the namespace does not leak its
shape.

### Protected pages

The web app guards `/admin` and `/student` in the server component, because the cookie is httpOnly and
only the API can verify it:

1. `lib/session.ts` reads the cookie with `next/headers` and calls `/api/auth/me` with it forwarded.
2. `lib/guards.ts` decides: no session → `/login?next=<target>`; wrong role → that role's own area;
   otherwise render.
3. `lib/redirect.ts` validates `?next=` before the login form uses it — protocol-relative, absolute
   and control-character paths all fall back to `/`, so the parameter cannot become an open redirect.

The header shows **Admin area** or **My area** for the signed-in role, the landing page has an
_Access control_ section that links straight into both guarded areas, and the session card calls the
same endpoint — so the guards are visible without opening DevTools.

---

## Admin console (Day 4)

The admin namespace stopped being a probe and became a console. Two screens, both rendered on
the server with data the API authorises per request:

```
/admin          layout (header + sidebar) → six stat cards, account mix, newest accounts, recent attempts
/admin/users    directory: search, role/status filters, sort, pagination, inline role/status actions
```

### Statistics come from aggregates, not the browser

`GET /api/admin/stats` answers in one round trip: user totals and role split, content counts by
quiz status, attempt totals by outcome, the pass rate and the average score, plus the five newest
accounts and attempts. Derived fields are defined once, in the API:

| Field               | Definition                                                                   |
| ------------------- | ---------------------------------------------------------------------------- |
| `passRate`          | `passed / (passed + failed + expired)`, one decimal, `0` when nothing graded |
| `averagePercentage` | mean stored percentage over **graded** attempts only                         |
| `learners`          | distinct users with at least one attempt                                     |
| `inactive`          | `total − active`, so the two can never disagree                              |

In-progress attempts are excluded from both the pass rate and the average: an unfinished attempt
has a score of zero, and counting it would make the platform look like it is failing everyone.

### User management

`GET /api/admin/users` pages (`pageSize` 1–50), searches name **or** email, filters by role and
status, and sorts by `newest`, `oldest`, `name` or `attempts`. Each row carries `attempts`,
`completedAttempts`, `bestPercentage` and `lastAttemptAt` from a single grouped join — and
`passwordHash` is never selected, so it cannot leak into a payload.

`PATCH /api/admin/users/:id` changes a role and/or status. The body goes through Hono's JSON
validator, which is also what gives the web client an inferred `json` type:

| Situation                         | Answer                                            |
| --------------------------------- | ------------------------------------------------- |
| `{}` or only unknown keys         | `422 VALIDATION_ERROR` — "Provide role or status" |
| unknown id / non-UUID id          | `404 USER_NOT_FOUND` / `422 VALIDATION_ERROR`     |
| you demote or deactivate yourself | `409 SELF_LOCKOUT`                                |
| student or anonymous caller       | `403 FORBIDDEN` / `401 UNAUTHENTICATED`           |

`SELF_LOCKOUT` is the only lockout rule, and it is sufficient: every caller is an active admin, so
the admin making a change always remains one. It is a `409` rather than a `403` because the
request is legal — the resulting state is not.

Deactivation is immediate. Because `requireAuth` re-reads the user row on every guarded request,
an already-issued cookie stops working on its next use: `PATCH {status: INACTIVE}` → their next
`/api/auth/me` is `403 ACCOUNT_INACTIVE`, and reactivating restores the same cookie.

### The console UI

Filters live in the URL (`?search=&role=&status=&sort=&page=`), so a view is shareable and the back
button works, and the filter form is a plain GET form that needs no JavaScript. The table itself is
server-rendered; only the action buttons are a client component that sends the `PATCH` through
`hc<AppType>` and then calls `router.refresh()`, which keeps counts and pagination truthful after
a change.

Full detail — every field definition, the directory query semantics, the failure states and where
each rule is tested — is in [`docs/admin-dashboard.md`](docs/admin-dashboard.md).

---

## Quiz management (Day 5)

Quizzes are the first thing an admin can _shape_, not just read. Everything sits behind the Day 3
`requireAdmin` guard:

```
/admin/quizzes          directory: filters in the URL, pagination, question/attempt counts
/admin/quizzes/new      create form (always a DRAFT)
/admin/quizzes/:id      edit form + lifecycle card + record panel
```

### Slugs are derived, and stable

The client sends a title; the API derives the slug (`"  Kubernetes Basics — Part 1!  "` →
`kubernetes-basics-part-1`), strips accents, collapses punctuation and suffixes on collision
(`-2`, `-3`). Renaming a quiz **keeps** its slug, because a slug may already be in a link
someone holds.

### Publishing is a separate, guarded action

Status is not an editable field — it is the result of two endpoints, so a content edit can never
flip it:

| Call                                  | Answer                               |
| ------------------------------------- | ------------------------------------ |
| publish a draft with questions        | `200 PUBLISHED`                      |
| publish a draft with no questions     | `409 QUIZ_HAS_NO_QUESTIONS`          |
| publish an already-published quiz     | `200` — idempotent, the intent holds |
| unpublish a published quiz            | `200 UNPUBLISHED`                    |
| unpublish a draft or unpublished quiz | `409 QUIZ_NOT_PUBLISHED`             |

### Deleting protects student history

`DELETE /api/admin/quizzes/:id` cascades to questions, options, answers and attempts. Once a quiz
has been attempted, those rows are history: the API answers `409 QUIZ_HAS_ATTEMPTS` and points at
unpublishing instead. A quiz with no attempts deletes cleanly.

Both rules live in `packages/shared/src/quiz.ts` (`canPublish`, `canDelete`), so the UI can disable
a button _and say why_ while the API remains the authority. Partial updates declare their fields
without the create-time defaults, so `PATCH { title }` cannot silently reset a 45-minute duration
back to 20.

Full detail — every query parameter, the lifecycle table, the screens and their failure states, and
where each rule is tested — is in [`docs/quiz-management.md`](docs/quiz-management.md).

---

## Categories & questions (Day 6)

### Categories are data, not an enum

```
POST { "name": "react" }   → 200 { created: false }   reuses "React"
POST { "name": "Rust" }    → 201 { created: true }    creates it
DELETE (3 quizzes filed)   → 409 CATEGORY_HAS_QUIZZES
```

Names are compared `trim` → collapse whitespace → `toLowerCase`, so casing can never create a
duplicate; a `unique index on lower(name)` enforces the same thing at the database level for
concurrent writes. Renaming keeps the slug (it may already be in a link) and answers
`409 CATEGORY_EXISTS` when a sibling already owns the name. Deleting is `restrict`ed by the foreign
key: removing a label never removes content.

### A question is a set, not a row

```json
{
  "questionText": "Which method parses JSON?",
  "options": [{ "text": "JSON.stringify()" }, { "text": "JSON.parse()" }],
  "correctIndex": 1,
  "marks": 2,
  "difficulty": "EASY"
}
```

Because the option list and the correct index are validated together, "no correct answer" and "two
correct answers" are not states the database can hold. Two further rules keep history honest:

| Situation                                    | Answer                             |
| -------------------------------------------- | ---------------------------------- |
| delete a question that has recorded answers  | `409 QUESTION_HAS_ANSWERS`         |
| remove an option a student already picked    | `409 OPTION_HAS_ANSWERS`           |
| delete the last question of a published quiz | `409 QUIZ_WOULD_HAVE_NO_QUESTIONS` |
| reorder with a partial or foreign id list    | `422 QUESTION_ORDER_MISMATCH`      |

Editing is a `PUT` that replaces the whole set: a partial patch could delete the option the
`correctIndex` points at. Options are reconciled **by id**, so retained options keep the identity
every past answer references. Positions are compacted to `0..n-1` after deletes and rewritten on
reorder.

The UI is an inline authoring panel on the quiz edit page — add, edit, reorder, delete — plus a
`/admin/categories` table with inline rename. Rules are mirrored in
`packages/shared/src/question.ts` so the console disables a button and explains it, while the API
stays the authority.

### Four formats, not one

§10 lists question types as future work; all of them that make sense as a _grading_ shape ship here.

| Type         | Authored as                                   | Graded                                    |
| ------------ | --------------------------------------------- | ----------------------------------------- |
| `MCQ`        | 2–6 options, exactly one key                  | the chosen option is the key              |
| `MULTI`      | 2–6 options, two or more keys                 | the chosen **set** must equal the key set |
| `TRUE_FALSE` | a statement; the server writes `True`/`False` | the chosen option is the key              |
| `FILL_BLANK` | one or more accepted answers                  | typed text, compared after normalisation  |

Image-based and code-based questions are not a fifth and sixth type: `imageUrl` and `codeSnippet`
are presentation fields on `questions`, rendered above the options for any of the four. The paper a
student receives carries the format and the media but never a correctness flag — and a fill-in-the-
blank ships **no options at all**, because there its options are the answer key.

A multiple-answer question is all-or-nothing on purpose: the pass mark, the negative-marking penalty
and the attempt totals are all written against "a question is right or wrong". `FILL_BLANK` forgives
what a person cannot see (case, runs of space, curly quotes, a trailing full stop) and nothing else.
Results and the review screen break a mixed paper down by format, and the CSV/`.xlsx` importer
carries all four formats through an optional `type` column. "Match the following" is the one item on
§10's list that is not built, and
[`docs/advanced-features.md`](docs/advanced-features.md) §10 argues why: it needs a pair table, a
different answer shape and partial credit the grader does not have.

Full detail — the schema, the per-format payloads, the grader's rules, the console and taker screens,
the importer's columns, the tests — is in
[`docs/question-formats.md`](docs/question-formats.md). The authoring rules themselves are in
[`docs/categories-and-questions.md`](docs/categories-and-questions.md), and the decision to leave
"match the following" out is in [`docs/advanced-features.md`](docs/advanced-features.md) §10.

---

## Taking a quiz (Day 7)

The student area is now a working product surface, not a role probe:

```
/student                resume banner, counts, best score, suggestions
/student/quizzes        published-only catalogue, filters in the URL
/student/quizzes/:id    the rules before you commit
/student/attempt/:id    the taker: one question at a time, numbered navigation, timer
```

```
POST /api/student/quizzes/:id/start   → 201 { resumed: false, expiresAt, secondsRemaining }
POST (again)                          → 201 { resumed: true,  same attemptId }
PUT  /api/student/attempts/:id/answers/:questionId { optionId }   → 200
```

Three properties matter more than the endpoints:

- **Published only.** A draft or unpublished quiz answers `404` to a student, exactly like a
  missing one — a guessed id reveals nothing.
- **The server owns the clock.** `expiresAt` is stamped on start and checked on every write;
  the countdown is re-derived from that timestamp and re-read when the tab regains focus, so
  throttled timers do not drift. Past the deadline: `409 ATTEMPT_EXPIRED`, and the attempt
  stops being resumable.
- **No answer key in the browser.** The attempt payload has option text and positions only.
  There is no `isCorrect` and no explanation to read out of devtools before submitting.

Resuming never spends an attempt: `start` returns the attempt already in flight. Answers save
one click at a time, so a closed tab loses at most one selection, and a refresh restores
everything from the API.

Submission is Day 8: **Submit quiz** confirms (naming any blank questions) and grades the paper on
the server, and the countdown does the same thing automatically at `00:00`.

Full detail — every rule, the attempt payload, the locked states and the trade-offs — is in
[`docs/student-quiz-interface.md`](docs/student-quiz-interface.md).

---

## Submission & scoring (Day 8)

```
POST /api/student/attempts/:id/submit   → 200 { alreadySubmitted: false, result: { … } }
POST (again)                            → 200 { alreadySubmitted: true,  same completedAt }
```

The request carries no score and no claim about why it was sent. The server looks at `expiresAt`:

- **before the deadline** → a manual submission; `completedAt = now`;
- **at or after it** → an automatic one; `completedAt` is clamped to `expiresAt`, so the recorded
  time taken is exactly the quiz duration and a late network call changes nothing.

`gradeAttempt()` in `packages/shared` is the only grader, and both paths reach it through the same
handler. It reads the saved answers against the key in `options.is_correct` and produces marks,
correct / incorrect / unanswered counts, a percentage, pass/fail (inclusive of the pass mark) and
time taken. A selection that is not one of that question's options counts as unanswered, never as a
guess. An empty paper can never pass.

**Expiry is lazy**, because this project has no cron: every student read first settles any of that
student's attempts whose deadline has passed (bounded to 50 per request). A closed laptop is graded
on the next page load, and the catalogue's best score includes it.

**The result is stored, not recomputed.** The attempt row keeps the score, totals, counts,
percentage, status and time taken, and `answers.is_correct` is stamped per answer for Day 9's review.
A retry re-reads those columns, so a percentage cannot move under the student.

The attempt screen swaps to a result card when a result exists: percentage, `8 of 10 marks`, pass
mark, the four counts, time taken, and — only when the clock ended it — a "time ran out" note. If the
auto-submit request fails, the alert keeps a **Retry** action instead of pretending it worked.

Full detail, including the error table and the trade-offs, is in
[`docs/submission-and-scoring.md`](docs/submission-and-scoring.md).

---

## Results & answer review (Day 9)

```
GET /api/student/attempts                 → history: rows, pagination, filters, totals
GET /api/student/attempts/:id/review      → the paper with the key, verdicts and explanations
```

**The answer key only exists after submission.** The review endpoint is the one payload in the
product that carries `isCorrect`, `correctOptionId` and `explanation`, and it answers
`409 ATTEMPT_NOT_ACTIVE` while the attempt is still running — so opening a second tab mid-quiz
reveals nothing. Another student's attempt is `404`, exactly like a missing one.

Every question comes back with its verdict in three states, never two: **correct**, **incorrect** or
**not answered**. The counts add up to the paper, `counts.correct` equals the stored
`correctAnswers`, and the per-question `earnedMarks` sum to the stored score — the review is derived
from the same rules the Day 8 grader used. A saved answer pointing at an option that has since been
deleted reads as unanswered, not wrong.

The history is scoped to the caller and filterable by `status`, `quizId` and `sort`
(`newest` / `oldest` / `score`), with `totals` over the whole history rather than the current page.
A timed-out attempt is settled by the Day 8 sweep before the query, so "in progress" only ever means
genuinely live.

On screen:

- `/student/attempt/:id/review` — filter chips with live counts (`All 20`, `Correct 16`, …), one card
  per question keeping its original number, the options marked `your answer` / `correct`, the
  verdict sentence, and the explanation.
- `/student/results` — totals, status and sort chips as links, per-row `Review` / `Score` (or
  `Resume`), and pagination.
- The Day 8 result card now links straight into the review.

Full detail is in [`docs/results-and-review.md`](docs/results-and-review.md).

---

## Student dashboard (Day 10)

```
GET /api/student/dashboard   → totals · streak · trend · categories · activity · recent
```

Spec §15 asks for six statistics. All of them — and the charts around them — come from **one** request,
computed in SQL over the caller's attempts, never summed in the browser:

| Figure             | Rule                                                              |
| ------------------ | ----------------------------------------------------------------- |
| Quizzes attempted  | `count(distinct quiz_id)` — two sittings of one quiz are one quiz |
| Passed / failed    | `PASSED` / `FAILED` statuses                                      |
| Average score      | Mean over **graded** attempts only                                |
| Highest score      | Max over graded attempts                                          |
| Questions answered | `correct + incorrect` — a blank was not answered                  |
| Pass rate          | `passed / (passed + failed)`, `null` before the first submission  |

Everything averaged or rated ignores `IN_PROGRESS` rows: their stored percentage is `0`, and counting
them would read a live attempt as a failure. The route calls the Day 8 expiry sweep first, so a
deadline that just passed cannot leave a stale "in progress" behind. `quizzesAvailable` reports how
many quizzes are published right now, which gives "4 of 8 attempted" a denominator; `bestPercentage`,
`passRate`, `accuracy` and `averageTimeSeconds` are `null` — not `0` — for a student with no graded
attempt, and the UI prints `—`.

Six queries run in parallel (totals, quiz quota, the last twelve graded rows, per-category aggregates,
the fourteen-day `strftime` grouping and Day 9's history query for the recent strip). No migration: the
data was already there.

On screen, `/student` is now the dashboard — the catalogue moved to `/student/quizzes`:

- eight stat cards with captions (`of 8 published`, `75% pass rate`, `74% answer accuracy`);
- a **score trend** line over the last twelve graded attempts, y-axis pinned 0–100, a dashed pass-mark
  rule and a tooltip per point (server-rendered SVG, no chart library);
- a **fourteen-day activity** chart, zero-filled so quiet days keep their slot;
- a **category breakdown** where each bar links into the filtered catalogue;
- recent attempts, a resume banner for a live attempt, and the quizzes still available to take.

Full detail is in [`docs/student-dashboard.md`](docs/student-dashboard.md).

---

## Admin analytics (Day 11)

```
GET /api/admin/analytics?days=7|14|30|90   → students · quizzes · attempts · timeline · popularity
```

One request feeds the whole screen. `?days=` is validated by the API (`422` for anything else, an
empty value means the default 30) and the web page keeps the window in the URL, so every chart is a
link away and a reload reproduces the view.

The definitions are the product here:

| Figure             | Rule                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Pass rate          | `passed / (passed + failed)`; **expired** attempts are a separate slice, because nobody submitted them |
| Averages           | Graded attempts only — an `IN_PROGRESS` row stores a `0` that was never earned                         |
| Attempts over time | Grouped on `started_at` (when people sat quizzes), zero-filled across the window                       |
| Registrations      | STUDENT accounts by `created_at`, merged onto the same day grid                                        |
| Popularity         | Ordered by attempts; `learners` counts distinct students                                               |

Timed-out attempts are settled before anything is counted: the student screens only sweep for the
caller, so `buildAdminAnalytics` finds the owners of stale `IN_PROGRESS` rows and expires each through
the same Day 8 grading path. Nothing is written to a status column by hand.

On screen, `/admin/analytics` (now a live item in the console sidebar) shows:

- six stat cards — students, active learners, attempts, pass rate, average score, quizzes;
- **attempts over time** as server-rendered SVG bars, with **registrations** as a line on their own
  scale and a tooltip per day;
- the **pass/fail split** as one stacked bar plus a legend with counts and percentages;
- the **most popular quizzes** (average score bar, attempts, learners, pass rate, category, linking to
  the editor) and the **most popular categories** (relative bars, with untouched ones kept visible).

Full detail is in [`docs/admin-analytics.md`](docs/admin-analytics.md).

---

## Leaderboard (Day 12)

```
GET /api/leaderboard?metric=average|best|completed&period=all|month|week&categoryId=…
```

One endpoint answers every board the spec asks for: overall and per-category, ranked by average score,
best score or quizzes completed, over all time, the last 30 days or the last 7.

The ranking rules are the product, so they live in one pure function in `@quiz/shared`:

| Rule          | Behaviour                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------- |
| Who ranks     | Graded attempts only (`PASSED`/`FAILED`) — a live paper has no score                         |
| Order         | Chosen metric, then average, then best score, then quizzes completed, then name              |
| Ties          | Competition ranking — `1, 2, 2, 4`; equal values share a rank and the next place skips ahead |
| Gap           | Metric points (or quizzes) behind the row above; `0` for the leader and for tied rows        |
| Periods       | Rolling windows on `completed_at`, so "this week" means the last 7 days on any day           |
| Your position | `currentUser` is resolved against the whole board, not the visible page                      |

The query is strict (`422` for `?metric=streak`, `?period=year`, `?limit=0|500`) while the page's
parser falls back to the defaults, so a hand-edited URL always renders something sensible.

On screen, `/student/leaderboard` (a live item in the student nav) shows:

- metric chips (average / best / completed), period chips (all time / this month / this week), and a
  category row that comes from the response, not a constant — every category in the database, every
  one a link, all of it in the URL;
- **your position** — rank, metric value, finished attempts, quizzes completed and pass rate, with
  `2nd of 4 · top 50%` as the caption and an invitation to take a quiz when the caller has none;
- a **podium** for the top three and the full ranked table beneath it, the caller's row tinted and
  badged **You**;
- a short "how ranking works" card that states the rules without a doc link.

Full detail is in [`docs/leaderboard.md`](docs/leaderboard.md).

---

## Advanced features (§26)

Everything the brief calls advanced is live, in the UI and behind a contract:

| Feature                | Where it lives                                          | What it does                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question randomisation | `quizzes.shuffle_questions`                             | Dealt **once** at start into `attempts.question_order`; every read replays it, so a refresh cannot reshuffle a paper                                                                                           |
| Option randomisation   | `quizzes.shuffle_options`                               | Independent of the question order; stored in `attempts.option_order`                                                                                                                                           |
| Negative marking       | `quizzes.negative_marks`, frozen onto the attempt       | `penalty = round(marks × wrong, 2)`, `score = max(0, earned − penalty)`; **skipped answers are never penalised**                                                                                               |
| Maximum attempts       | `quizzes.max_attempts`                                  | Enforced by `startDecision`, after the window and before a new start — an attempt already open can always be finished                                                                                          |
| Scheduling             | `available_from` / `available_until`                    | Start-inclusive, end-exclusive; `SCHEDULED` and `CLOSED` states in the catalogue with a human "opens in 3 hours"                                                                                               |
| Certificates           | `certificate_enabled` on the quiz, `certificates` table | Issued on a pass, idempotent per attempt, `QP-XXXX-XXXX`, publicly verifiable at `/verify/:code`, printable                                                                                                    |
| Email notifications    | `email_outbox`                                          | `WELCOME`, `PASSWORD_RESET`, `RESULT`, `CERTIFICATE` — written to an outbox (never blocking a request), sent through `log` / `webhook` / `resend`, and inspectable, drainable and retryable at `/admin/emails` |
| Appearance toggle      | `components/theme-toggle.tsx`                           | A real light theme for both consoles, cookie-backed and rendered server-side so there is no flash                                                                                                              |
| Question import        | `POST /api/admin/quizzes/:quizId/questions/import`      | CSV **and** `.xlsx` (unzipped in the browser, posted as the same CSV text), with a dry-run preview, per-line issues and a 200-row cap                                                                          |

Two of these deserve a sentence beyond the table.

**Randomisation is stored, not re-rolled.** The order is dealt when the attempt
starts and written to the attempt row. That is the only way the attempt screen,
the resume, the review and the admin's view can agree — and the only way a
refresh is not a way to get an easier paper.

**The appearance toggle is scoped to the consoles.** The landing page is a film
of a dark room; the working screens are read for an hour at a time and deserve a
light theme. The attribute goes on the console shell, the choice goes in a
cookie, and the layout reads it on the server — an inline script that flips a
class after parse is the usual approach and always shows a frame of the wrong
colour.

Full detail — including the §25 endpoint map, which routes differ from the
specification's list and why — is in
[`docs/advanced-features.md`](docs/advanced-features.md).

---

## Security (Day 13)

Every request passes the same gauntlet before a handler runs, and each step can stop it:

```
requestId → security headers → Cache-Control: no-store → 64 KB body limit
        → same-origin guard → CORS → logger → requireAuth / requireRole
        → Zod (body · query · param) → handler
```

| Control                   | Behaviour                                                  | Refusal                                |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| Sign-in, per address      | 10 failures / 5 min, checked before any hashing            | `429 RATE_LIMITED` + `Retry-After`     |
| Sign-in, per account      | 5 failures / 15 min, consulted only after a wrong password | `429`, and the owner can still sign in |
| Registration, per address | 10 / hour                                                  | `429`                                  |
| Same-origin guard         | a state-changing request with a foreign `Origin`           | `403 CROSS_ORIGIN_BLOCKED`             |
| Body limit                | anything over 64 KB                                        | `413 PAYLOAD_TOO_LARGE`                |
| Session JWT               | HS256, `iss: quiz-api`, `aud: quiz-web`, httpOnly cookie   | `401 INVALID_SESSION`                  |
| Role check                | the **stored** role, re-read per request                   | `403 FORBIDDEN`                        |
| Validation                | every body, query and path param through Zod               | `422 VALIDATION_ERROR`                 |
| Caching                   | `Cache-Control: no-store`, `Vary: Cookie, Origin`          | —                                      |

The account guard is deliberately soft. A hard lockout is a denial-of-service gift — anyone who knows
an email could lock its owner out — so the bucket is consulted _after_ the password is rejected: it
stops answering guesses, and never stops the real owner.

On the web side, `apps/web/src/lib/security-headers.ts` (imported by `next.config.ts`, unit tested on
its own) sends a CSP with `default-src 'self'`, `object-src 'none'`, `base-uri`/`form-action` locked to
self and `frame-ancestors` limited to the app plus the sandbox preview hosts, along with `nosniff`, a
referrer policy and a closed-down `Permissions-Policy`. `X-Frame-Options` is deliberately absent: it
cannot express that allow-list and `DENY` would break the preview iframe.

The adversarial suite (`security.test.ts`, 51 tests) attacks each of the nine areas the spec names —
forged and foreign-scoped tokens, role escalation, another student's paper, a client-set deadline, a
score in the request body, injection strings, oversized payloads and cross-site writes — and the
trade-offs (in-memory buckets, the trusted proxy header, the CSP's `'unsafe-inline'`) are written down
rather than left implicit.

Full detail is in [`docs/security.md`](docs/security.md).

---

## Deployment (Day 14)

The platform is meant to leave the laptop, so the last milestone makes shipping a thing you can check.
Every fact below is produced by the code, not by this document.

### The gate: eight rules, one verdict

`packages/shared/src/deployment.ts` exports `evaluateEnvironment(snapshot)` — a pure function over a
plain object, so it runs before a build, inside the API and in a test with no process involved.

| #   | Check              | Fails when                                 | Warns when                                        |
| --- | ------------------ | ------------------------------------------ | ------------------------------------------------- |
| 1   | Database URL       | unset, or a `file:` URL in production      | a `file:` URL outside production                  |
| 2   | Database token     | a remote URL with no `TURSO_AUTH_TOKEN`    | — (skipped for `file:`)                           |
| 3   | Session secret     | unset or under 32 characters in production | unset or short in development                     |
| 4   | Web origin         | not a valid http(s) URL                    | unset, or plain `http` in production              |
| 5   | API proxy target   | not a valid http(s) URL                    | unset, so the localhost default stays             |
| 6   | Runtime mode       | —                                          | `NODE_ENV` is not `production`                    |
| 7   | Sign-in rate limit | —                                          | the limiter is disabled (`AUTH_RATE_LIMIT_MAX=0`) |
| 8   | Request body cap   | —                                          | outside 1 KB – 5 MB                               |

Any failure → `blocked`, otherwise any warning → `attention`, otherwise `ready`. The asymmetry is the
point: the same missing secret must stop a release and must not stop `bun dev`.

### Three surfaces, one implementation

```bash
bun run deploy:check                              # before the build: the env, exit 1 when blocked
bun run deploy:check --url https://quiz.example.com   # after: eight live probes
bun run deploy:check --url https://quiz.example.com --admin admin@quiz.dev:'<password>'
                                                  # … plus the server's own self-report
```

- **Before** — reads `.env.local`, `.env`, then the process; prints each check with its detail and
  exit code; never fails on a warning, so it is safe as a CI gate.
- **After** — probes `/api/health`, `/api/health/db` (a deployed API answering `target: 'file'` is a
  failure), the 401 session guard, the hardening headers, the error envelope, the web app, the CSP and
  the web→API proxy. `--admin` adds a sign-in and reads `/api/admin/system`.
- **From inside** — `GET /api/admin/system` (admin-only, `no-store`) returns the service, the
  redacted database, the effective limits, the counts and the same eight checks. It still answers when
  the database is down (`connected: false`, `counts: null`), because that is when you need it.
  `/admin/system` renders it as the operator console.

### Deploy order

```bash
turso db create quizplatform && turso db show quizplatform --url  # 1. database
bun run db:migrate                                               # 2. schema — a release step
bun run db:seed                                                  # 3. optional: demo data
bun run --filter=@quiz/api start                                 # 4. API on 3001
bun run --filter=@quiz/web build && bun run --filter=@quiz/web start  # 5. web on 3000
bun run deploy:check --url https://quiz.example.com              # 6. verify from outside
```

The API never migrates at boot — two instances starting together would race the same DDL, and a
migration on a request path is one you cannot roll back. Seeds are demo data with public passwords;
reseeding invalidates every existing session.

`Dockerfile` packages the same commands: a `deps` stage with Bun, a `build` stage, then `--target api`
and `--target web` runtime stages on Node 22, non-root, each with a health check. The web target takes
`API_INTERNAL_URL` as a **build arg**, because `rewrites()` is compiled into the Next server.

Rollback is redeploying the previous tag: both processes are stateless (the cookie is a signed JWT and
the database row is the authority), and every migration in this repo is additive, so a previous API
can read the current schema. Reverting a migration means writing a new one.

Environment matrix, verification checklists, the operator screen, rollback and the operational limits
are in [`docs/deployment.md`](docs/deployment.md).

## Environment variables

`.env.example` is the canonical list with comments; this is the summary.

| Variable                         | Required | Default                 | Used by                 |
| -------------------------------- | -------- | ----------------------- | ----------------------- |
| `NODE_ENV`                       | in prod  | `development`           | both                    |
| `TURSO_DATABASE_URL`             | yes      | —                       | db, api, drizzle-kit    |
| `TURSO_AUTH_TOKEN`               | yes      | —                       | db, api, drizzle-kit    |
| `DATABASE_URL`                   | no       | —                       | alias for the URL above |
| `JWT_SECRET`                     | in prod  | dev fallback + warning  | session JWT signing     |
| `WEB_ORIGIN`                     | in prod  | `http://localhost:3000` | CORS + origin guard     |
| `API_INTERNAL_URL`               | in prod  | `http://localhost:3001` | web rewrite target      |
| `API_PORT`                       | no       | `3001`                  | api                     |
| `AUTH_RATE_LIMIT_MAX`            | no       | `10`                    | api (`0` disables)      |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | no       | `300`                   | api                     |
| `REGISTER_RATE_LIMIT_MAX`        | no       | `10`                    | api                     |
| `MAX_BODY_BYTES`                 | no       | `65536`                 | api                     |
| `NEXT_PUBLIC_API_BASE_URL`       | no       | `''` (same origin)      | web, split deployments  |

---

## Roadmap

Day 1 (done): monorepo, API, Drizzle schema, migrations, seed, env config, tests.

Day 2 (done): register, login, logout, `/me`, scrypt hashing, httpOnly JWT cookies, login/register
pages, session-aware header, live session card on the landing page, `requireAuth` / `requireRole`
guards, 154 Vitest tests and a 12-check end-to-end smoke run.

Day 3 (done): `requireAdmin` / `requireStudent`, guarded `/api/admin/*` and `/api/student/*`
namespaces with access descriptors, server-side guards on `/admin` and `/student`, `?next=` return
paths with open-redirect protection, 184 Vitest tests and a 17-check end-to-end smoke run.

Day 5 (done): quiz CRUD behind the admin guard, server-derived stable slugs, `GET /api/admin/quizzes`
with search/filter/sort/pagination, a publish/unpublish lifecycle that refuses to publish empty
quizzes, deletion that refuses to erase student history, and create/edit screens for the console.
364 Vitest tests and a 36-check end-to-end smoke run.

Day 6 (done): category CRUD with case-insensitive find-or-create, rename that keeps the slug and a
delete that refuses to cascade into quizzes; question authoring with 2–6 options and exactly one
correct answer, marks, difficulty and explanations; option reconciliation by id so past answers stay
intact; whole-list reordering; and delete rules that protect answers and keep a published quiz from
going empty. `/admin/categories` plus a full authoring panel on the quiz edit page. 430 Vitest tests
and a 46-check end-to-end smoke run.

Day 7 (done): the student side. A published-only catalogue with URL filters, a pre-flight details
page, and a timed attempt with per-answer autosave, question navigation, resume-without-spending-a-try
and a server-enforced deadline. The attempt payload carries no correctness data. `/student`,
`/student/quizzes`, `/student/quizzes/:id` and `/student/attempt/:id`. 489 Vitest tests and a
53-check end-to-end smoke run.

Day 8 (done): submission and scoring. One pure grader behind one idempotent endpoint, serving both
the Submit button and the countdown; `completedAt` clamped to the deadline so a late call cannot
change the time taken; lazy expiry on every student read; the attempt row stores the full result and
`answers.is_correct` is stamped for the review; the attempt screen becomes a result card. 523 Vitest
tests and a 58-check end-to-end smoke run.

Day 14 (done): deployment & docs. Eight environment rules in one pure function, evaluated in three
places — `bun run deploy:check` before a build, `GET /api/admin/system` from inside the process, and
`deploy:check --url` over the wire after the deploy — with a verdict of `ready`, `attention` or
`blocked`; a redacted system screen at `/admin/system`; one `Dockerfile` with `api` and `web` targets;
and `docs/deployment.md`, the runbook for migrate, verify, roll back and diagnose. 1,086 Vitest tests
and a 75-check end-to-end smoke run.

Day 13 (done): testing & security. Rate limiting on the auth routes (a hard per-address block and a
soft per-account one that can never lock the owner out), a same-origin guard on every state-changing
request, a 64 KB body cap, `no-store` on every response, JWTs scoped by issuer and audience, and a CSP
on every page — each with a test. `security.test.ts` attacks the nine areas the spec lists. 800 Vitest
tests and a 73-check end-to-end smoke run.

Day 12 (done): the leaderboard. `GET /api/leaderboard` ranks students by average score, best score or
quizzes completed — overall or per category, all time, monthly or weekly — with competition ranking,
metric-unit gaps and the caller's own position resolved even off-page. The board ships the live
category filter with it, read from the categories table on every request, so a category added in the
admin console is on the leaderboard the next time it loads. `/student/leaderboard` renders the board
server-side with the filters in the URL. 741 Vitest tests and a 69-check end-to-end smoke run.

Day 11 (done): admin analytics. `GET /api/admin/analytics` answers the spec's admin charts — attempts
over time, registrations, the pass/fail split, and the most popular quizzes and categories — over a
7/14/30/90-day window, alongside the student, quiz and attempt statistics. The endpoint settles
timed-out attempts across all users before counting, and `/admin/analytics` renders four
server-side charts with no chart library. 683 Vitest tests and a 67-check end-to-end smoke run.

Day 10 (done): the student dashboard. `GET /api/student/dashboard` answers the spec's six statistics
plus a streak, a twelve-attempt score trend, per-category averages, a fourteen-day activity window and
the five most recent attempts — all scoped to the caller, settled by the expiry sweep, and defined so
that a live attempt moves no average. `/student` becomes the dashboard with server-rendered SVG
charts; the catalogue moves to `/student/quizzes`. 622 Vitest tests and a 65-check end-to-end smoke
run.

Day 9 (done): results and review. `GET /api/student/attempts/:id/review` releases the key, the
verdicts and the explanations — only for a finished attempt, `409` while it is live. The three-way
verdict split keeps blank questions out of the wrong count, and the per-question marks sum to the
stored score. `GET /api/student/attempts` adds a paged history with status/quiz filters, three sorts
and lifetime totals. `/student/results` and `/student/attempt/:id/review` render them; the result card
links into the review. 563 Vitest tests and a 63-check end-to-end smoke run.

Day 4 (done): admin console shell with sidebar navigation, `GET /api/admin/stats` aggregates,
`GET /api/admin/users` with search/filter/sort/pagination, `GET` and `PATCH /api/admin/users/:id`
with the `SELF_LOCKOUT` rule, server-rendered `/admin` and `/admin/users` screens, 258 Vitest tests
and a 25-check end-to-end smoke run.

| Day | Milestone                                                         |
| --- | ----------------------------------------------------------------- |
| 2   | ✅ Authentication — register, login, logout, hashing, JWT cookies |
| 3   | ✅ Role-based authorization — admin/student guards                |
| 4   | ✅ Admin console — statistics + user management                   |
| 5   | ✅ Quiz management — CRUD + publish/unpublish                     |
| 6   | ✅ Categories & questions — CRUD, options, correct answers        |
| 7   | ✅ Student quiz UI — listing, details, navigation, timer          |
| 8   | ✅ Submission & scoring — server-side grading, expiry enforcement |
| 9   | ✅ Results & answer review, attempt history                       |
| 10  | ✅ Student dashboard & performance statistics                     |
| 11  | ✅ Admin analytics — charts, windows, pass/fail                   |
| 12  | ✅ Leaderboard — metrics, periods, categories, ranks              |
| 13  | ✅ Testing & security — hardened and attacked                     |
| 14  | ✅ Deployment & docs — gate, containers, runbook, smoke test      |

---

## Troubleshooting

**`/api/health/db` returns 503** — read the `error.code` and `details.reason`:

| Code                      | Meaning                                                            | Fix                                   |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `DATABASE_NOT_CONFIGURED` | No `TURSO_DATABASE_URL`, or a `libsql://` URL without a token      | Fill in `.env`                        |
| `DATABASE_SCHEMA_MISSING` | Credentials and connectivity are fine, but the tables do not exist | `bun run db:migrate` (then `db:seed`) |
| `DATABASE_UNAVAILABLE`    | The network or driver failed (`fetch failed → ECONNRESET`, …)      | Check connectivity / credentials      |

**`/admin` shows "Statistics are unavailable"** — the page rendered (so the ADMIN guard passed) but
the API could not answer `/api/admin/stats`. Open `/api/health/db`: if that is also failing, it is the
database, not the console. If the probe is healthy, the API on port 3001 is not running — the web
server proxies to it.

**`409 QUIZ_HAS_NO_QUESTIONS` when publishing** — the quiz has no questions yet. The API only
publishes quizzes students could actually sit; Day 6 adds question editing. Seeded drafts already
have questions, so the lifecycle is still demonstrable.

**`409 QUIZ_HAS_ATTEMPTS` when deleting** — someone has already attempted that quiz. Unpublish it
instead: deleting would erase their answers and scores along with it.

**`409 SELF_LOCKOUT` in the user directory** — you tried to demote or deactivate the account you are
signed in with. That is deliberate, and the rule doubles as "at least one admin must remain": sign
in as a different admin to change this one.

**`SERVER_ERROR: Server returned HTTP status 400` from `db:migrate` / `db:seed`** — Turso accepted
the TCP connection but rejected the statement. Migrations and seeding print a diagnosis before
exiting, including Turso's own response body, so the real reason is never hidden:

```
✖ Turso accepted the connection but rejected the query (HTTP 400).
  reason: SERVER_ERROR: Server returned HTTP status 400
  Raw response from Turso:
  HTTP 400 {"error":"..."}
```

That is almost always a token belonging to a different database (or a URL pasted with stray
characters). Confirm the pair and issue a fresh token:

```bash
turso db show <db> --url        # must match TURSO_DATABASE_URL exactly
turso db tokens create <db>     # put it in TURSO_AUTH_TOKEN
turso db list                    # is the database still there?
```

`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are normalised before use (quotes, backticks,
markdown links and zero-width characters are stripped, and a warning is printed when a value had
to be repaired), so a mangled paste is reported instead of failing later.

The reason is also printed in the API server log, e.g.
`[db] readiness check failed against libsql://…: … → SQLITE_ERROR: no such table: users`.

**`no such table: users`** — migrations were not applied to _that_ database. Run
`bun run db:migrate`, then `bun run db:seed`. `bun run db:generate` does not create tables.

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

**Signing in fails with `401 INVALID_CREDENTIALS`** — the password is wrong, or that email has no
account. Seeded logins are `admin@quiz.dev` / `Admin12345` and `{rahul,priya,amit}@quiz.dev` /
`Password123`. Registration always creates a `STUDENT`; administrator accounts come from the seed or
an owner.

**`403 ACCOUNT_INACTIVE`** — the password was correct but the account's `status` is `INACTIVE`.
Re-enable it (`UPDATE users SET status = 'ACTIVE' WHERE email = …`) or sign in with another account.

**`401 UNAUTHENTICATED` on `/api/auth/me`, the header shows “Sign in”** — no `quiz_session` cookie was
sent. Check that you sign in through the web origin (port 3000), not the API port directly: the
cookie is issued on the web origin so the Next.js `/api/*` rewrite keeps it first-party.

**`401 INVALID_SESSION` right after a restart** — the JWT no longer verifies. Changing `JWT_SECRET`
invalidates every existing session, and an unset secret falls back to the development one (the API
logs `[auth] JWT_SECRET is not set …`). Set a stable secret, then sign in again.

**`403 FORBIDDEN` on `/api/admin/...` (or `/api/student/...`)** — you are signed in with the wrong
role: the two namespaces are exclusive. Use the seeded admin (`admin@quiz.dev`) for `/api/admin/*`
and a student account for `/api/student/*`, or promote the account in the database
(`UPDATE users SET role = 'ADMIN' WHERE email = …`) and sign in again.

**`/admin` bounces me to `/student` (or the reverse)** — that is the page guard working: each role is
redirected to the area it owns. Anonymous visitors land on `/login?next=/admin` and come back to
`/admin` after signing in, as long as `?next=` is a same-origin path (off-origin values fall back to
`/`).

**The header shows “Sign in” on `/admin` even though you just logged in** — the session cookie was not
sent with the request. Sign in on the web origin (port 3000) rather than on the API port, and check
that the browser is not blocking the `quiz_session` cookie.

**`JWT_SECRET must be set to at least 32 characters in production`** — the API refuses to boot in
production without one. Generate it with `openssl rand -base64 48` and set it in the environment.

**Preview host blocks the request** — `next.config.ts` lists `*.e2b.app` in `allowedDevOrigins`. Add
your own preview domain there if it differs.

**Port already in use** — stop the other process or set `API_PORT` in `.env` and point
`API_INTERNAL_URL` at the new port.

**Browser console: “module factory is not available” / stale chunk errors** — chunks on disk changed
under a running dev server (usually after reinstalling dependencies). Stop the server, delete
`apps/web/.next`, restart, and hard-reload the page.
