# Deployment & operations (Day 14)

Day 14 of the spec is the last one: deploy the platform, document it, and prove the deployed thing
works. A deployment is not a step you remember to take — it is a set of facts about the environment
that can be checked, and a set of commands that either pass or fail.

This milestone adds four things:

| File                                     | What it is                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/shared/src/deployment.ts`      | The eight rules, the verdict, the response schema — pure, no `process.env`      |
| `apps/api/src/lib/system-status.ts`      | A redacted self-report: what the process is, what it is connected to, the rules |
| `apps/web/src/app/admin/system/page.tsx` | The operator console — the same report, readable                                |
| `scripts/deploy-check.ts`                | `bun run deploy:check`: the same rules locally, eight live probes against a URL |

Plus `Dockerfile`, `docs/deployment.md` (this page), the `#deployment` section on the landing page and
the environment matrix in `.env.example`.

---

## 1. The shape of a deployment

```
                 public                         private network
   browser ──────────────▶ web (Next.js, 3000) ──────────────▶ api (Hono, 3001) ──▶ Turso Cloud
     │                        │                                     │
     │  only the web origin   │  /api/* rewrite, server-side        │  one libsql:// connection
     └─ cookies are first-party on the web origin                  └─ holds both secrets
```

Two deployables, one public origin. The browser never learns the API's address: the web app proxies
`/api/:path*` to `API_INTERNAL_URL` inside the network, so the session cookie stays first-party on the
web origin and no CORS preflight is needed on the normal path. The API can still serve a browser that
calls it directly — that is what `WEB_ORIGIN` and the origin guard are for — but the default topology
does not require it.

Both processes are stateless with respect to each other. There is no shared session store: the cookie
carries a signed JWT and every protected request re-reads the user row, so any API instance can serve
any request, and restarting one does not sign anybody out.

---

## 2. Prerequisites

- **Bun 1.4+** to build and to run the scripts; **Node 22+** to run the two servers in production
  (`next start` and `tsx`).
- A **Turso Cloud** database. This project does not fall back to a local database implicitly: with no
  credentials the API boots and reports itself unhealthy rather than silently serving a different
  dataset.
- The `turso` CLI, authenticated, if you are creating the database.

```bash
turso db create quizplatform
turso db show quizplatform --url            # → libsql://quizplatform-<org>.turso.io
turso db tokens create quizplatform         # → the auth token
```

---

## 3. Environment matrix

Every variable the two apps read. The API loads `.env.local`, then `.env`, then the process
environment — real environment variables win, which is what a hosting platform sets.

| Variable                         | Read by  | Production                     | Default                 | Notes                                                                  |
| -------------------------------- | -------- | ------------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`                       | both     | **required** `production`      | `development`           | Turns off pretty JSON and marks the cookie `Secure`                    |
| `TURSO_DATABASE_URL`             | API, CLI | **required**                   | —                       | `libsql://…` in production; `file:` only for local work and tests      |
| `TURSO_AUTH_TOKEN`               | API, CLI | **required**                   | —                       | Mint per database; rotate by minting and redeploying                   |
| `JWT_SECRET`                     | API      | **required**, ≥32 characters   | insecure dev secret     | `openssl rand -base64 48`. Changing it signs everyone out              |
| `WEB_ORIGIN`                     | API      | **required**, the https origin | `http://localhost:3000` | Trusted for CORS and the same-origin guard; no trailing path           |
| `API_INTERNAL_URL`               | web      | **required**, internal address | `http://localhost:3001` | Baked into the build by `rewrites()` — set it at build time            |
| `API_PORT`                       | API      | optional                       | `3001`                  | The API binds `0.0.0.0`                                                |
| `AUTH_RATE_LIMIT_MAX`            | API      | optional                       | `10`                    | Failed sign-ins per address per window; `0` disables the limiter       |
| `AUTH_RATE_LIMIT_WINDOW_SECONDS` | API      | optional                       | `300`                   | Window length for both auth buckets                                    |
| `REGISTER_RATE_LIMIT_MAX`        | API      | optional                       | `10`                    | New accounts per address per hour                                      |
| `MAX_BODY_BYTES`                 | API      | optional                       | `65536`                 | 1 KB – 5 MB; anything larger is refused before parsing                 |
| `DATABASE_URL`                   | API, CLI | optional                       | —                       | Alias for `TURSO_DATABASE_URL`, for platforms that insist on this name |
| `NEXT_PUBLIC_API_BASE_URL`       | web      | optional, usually empty        | `''` (same origin)      | Only for a split deployment where the browser calls another origin     |
| `SKIP_DB_PREFLIGHT`              | CLI      | never                          | —                       | `1` lets `drizzle-kit generate` run without credentials                |
| `DEMO_ACCOUNTS`                  | API      | **set to `0`**                 | `1` (published)         | `0` removes the seeded logins from `/api/landing` and the landing page |

`.env.example` is the same list as a template. `bun run deploy:check` prints the effective values
(names, lengths, redacted URLs — never the secrets) without starting anything.

---

## 4. The eight checks

`evaluateEnvironment(snapshot)` in `packages/shared/src/deployment.ts` runs these in a fixed order. It
takes a plain object rather than reading `process.env`, so a test can describe a production
deployment in three lines and the API can hand over exactly what it is willing to expose.

| #   | id                 | Label              | Fails when                                                      | Warns when                                        |
| --- | ------------------ | ------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `database-url`     | Database URL       | unset; in production a `file:` URL; not a libsql/https/file URL | a `file:` URL outside production                  |
| 2   | `database-token`   | Database token     | a remote URL with an empty token                                | — (skipped for `file:`)                           |
| 3   | `jwt-secret`       | Session secret     | unset in production; under 32 characters in production          | unset or short outside production                 |
| 4   | `web-origin`       | Web origin         | not a valid http(s) URL                                         | unset; plain `http` in production                 |
| 5   | `api-internal-url` | API proxy target   | not a valid http(s) URL                                         | unset, so the web app keeps its localhost default |
| 6   | `node-env`         | Runtime mode       | —                                                               | anything but `production` (skipped under `test`)  |
| 7   | `rate-limit`       | Sign-in rate limit | —                                                               | the limiter is disabled (`0`)                     |
| 8   | `body-limit`       | Request body cap   | —                                                               | outside 1 KB – 5 MB                               |

**Verdict.** Any `fail` → `blocked`. Otherwise any `warn` → `attention`. Otherwise `ready`. A `skip`
is neutral: it means "this surface does not have that fact", not "fine".

The important asymmetry is deliberate. A missing `JWT_SECRET` or a `file:` database is a **failure in
production and a warning in development** — the same inconsistency should stop a release and should
not stop `bun dev`. In production the API also refuses to boot without a secret (`resolveJwtSecret()`
exits non-zero), so the check and the process agree.

### Three surfaces, one implementation

| Surface                        | Reaches it how                                  | Use it when                                          |
| ------------------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| `bun run deploy:check`         | `evaluateEnvironment` on the local env          | before a build, in CI, in a pre-deploy hook          |
| `GET /api/admin/system`        | `getSystemStatus()` with the API's own env      | the service is already running and you want its view |
| `bun run deploy:check --url …` | `/api/admin/system` over HTTP, plus live probes | after the deploy, from outside the network           |

The rules live in exactly one place. The web screen only decides how a status looks
(`apps/web/src/lib/deployment-params.ts`). The landing page makes its own claim — but from the same
source of truth: `/api/landing` reads the database and the process at request time, so what it says
about the deployment cannot drift from what the code prints either.

---

## 5. Deploy order

The order matters in one place only — the schema must exist before the new API serves traffic — but
doing it in this order makes every failure point obvious.

### 5.1 Schema (once per release, before the new API starts)

```bash
export TURSO_DATABASE_URL="libsql://quizplatform-<org>.turso.io"
export TURSO_AUTH_TOKEN="…"

bun run db:migrate     # drizzle-kit migrate — applies packages/db/migrations in order
bun run db:seed        # optional: the demo accounts and content
```

- **The API never migrates at boot.** Two instances starting together would race the same DDL, and a
  migration that runs on a request path is a migration you cannot roll back. This is a release step.
- **Seeding is destructive to sessions.** `db:seed -- --force` recreates the demo users with new ids,
  so every existing cookie points at a user that no longer exists. Seed before you invite testers, or
  never in production.
- `drizzle-kit` refuses to generate or migrate when the URL and token do not match the same database
  (the preflight in `drizzle.config.ts`). `SKIP_DB_PREFLIGHT=1` exists for offline `generate` only.

### 5.2 API

```bash
bun install --frozen-lockfile || bun install
NODE_ENV=production \
TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" \
JWT_SECRET="…" WEB_ORIGIN="https://quiz.example.com" \
API_PORT=3001 \
bun run --filter=@quiz/api start          # tsx src/index.ts, binds 0.0.0.0
```

The banner prints the database it is connected to (redacted) and fails fast if the secret is missing.

### 5.3 Web

```bash
API_INTERNAL_URL="http://quiz-api.internal:3001" bun run --filter=@quiz/web build
API_INTERNAL_URL="http://quiz-api.internal:3001" bun run --filter=@quiz/web start
```

`API_INTERNAL_URL` is read by `next.config.ts` at **build** time because `rewrites()` is compiled into
the server. Set it for the build and keep the runtime value consistent so the health screen reports
the same thing. If you change the API's internal address, rebuild the web image.

### 5.4 Verify

```bash
bun run deploy:check --url https://quiz.example.com --admin admin@quiz.dev:'<password>'
```

---

## 6. Containers

One `Dockerfile`, three stages of interest: `deps` (workspace install), `build` (`bun run build`), and
two runtime targets that both use Node 22 and run as a non-root user.

```bash
# API
docker build --target api -t quiz-api:0.1.0 .

# Web — the proxy target is a build arg, not a runtime variable
docker build --target web \
  --build-arg API_INTERNAL_URL=http://quiz-api:3001 \
  -t quiz-web:0.1.0 .
```

```bash
docker network create quiz

docker run -d --name quiz-api --network quiz \
  -e NODE_ENV=production \
  -e TURSO_DATABASE_URL -e TURSO_AUTH_TOKEN -e JWT_SECRET \
  -e WEB_ORIGIN=https://quiz.example.com \
  quiz-api:0.1.0

docker run -d --name quiz-web --network quiz -p 3000:3000 \
  -e NODE_ENV=production \
  -e API_INTERNAL_URL=http://quiz-api:3001 \
  -e WEB_ORIGIN=https://quiz.example.com \
  quiz-web:0.1.0
```

Notes:

- Both containers declare a `HEALTHCHECK` — the API against `/api/health`, the web against `/login`
  (a 200 that does not need the API to be up, so the two checks do not cascade).
- Nobody publishes port 3001. The API is reachable only on the container network; the browser talks to
  the web origin.
- The runtime stages copy `node_modules` and the workspace source, because the packages ship
  TypeScript and are started with `tsx` rather than compiled to `dist/`. That keeps local `bun start`
  and the container identical, at the cost of a larger image.
- **No lockfile is committed** (it is gitignored by project policy), so `drizzle-orm`, `hono` and the
  rest resolve from the ranges in the manifests at build time. Pin the base image tag and rebuild from
  a tag, not from `latest`, if you need byte-identical images.
- The sandbox this repository is developed in has no Docker daemon, so the image itself was not built
  here. The commands it runs — `bun run build`, `next start`, `tsx src/index.ts` — are exactly the ones
  the live smoke run exercises (§8), so the failure mode is the Dockerfile's plumbing, not the app's.

On a platform with separate services (Render, Railway, Fly, Vercel + a container host), skip the
Dockerfile: point one service at `bun run --filter=@quiz/api start` and the other at the web build,
set the same variables, and let the platform's health checks use the endpoints above.

---

## 7. Verification

### 7.1 Before the build

```bash
bun run deploy:check
```

Exit `0` for `ready` or `attention`, `1` for `blocked`, `2` if it could not run. Warnings never fail
the command — they are things to read, not things that stop a deploy. That makes it safe as a CI gate:
a repository with no `.env` is blocked (no database URL), while a developer with a `file:` database
gets a warning rather than a red build.

### 7.2 After the deploy

```bash
bun run deploy:check --url https://quiz.example.com
bun run deploy:check --url https://quiz.example.com --api https://api.quiz.example.com
bun run deploy:check --url https://quiz.example.com --admin admin@quiz.dev:'<password>'
```

| Probe                    | Asks                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| API liveness             | `GET /api/health` → 200 with `status: 'ok'`                                             |
| API readiness + database | `GET /api/health/db` → 200, `connected: true`, and **not** `target: 'file'`             |
| Session guard            | `GET /api/auth/me` without a cookie → 401 `UNAUTHENTICATED`                             |
| Hardening headers        | `nosniff`, a referrer policy, a request id, and `Cache-Control: no-store`               |
| Error envelope           | an unknown route → 404 `NOT_FOUND`, not an HTML page or a stack trace                   |
| Web app reachable        | the landing page → 200                                                                  |
| Content-Security-Policy  | present, `default-src 'self'`, and no `'unsafe-eval'`                                   |
| Landing data             | `/api/landing` → 200, at least one published quiz, no `unavailableReason`               |
| Web → API proxy          | `/api/health` through the **web** origin → 200 (the rewrite is wired)                   |
| Navigation               | `/` → 200 with the nav landmark, the mobile trigger, a skip link and `<main id="main">` |
| Sign-in screen           | `/login` → 200 with labelled fields, autofill hints and the skip link                   |
| Server self-report       | optional: sign in as an admin, read `/api/admin/system`, refuse a `blocked` verdict     |

The last probe is the important one: it is the server's own opinion of its configuration, not the
deploy script's idea of what it might be.

### 7.3 By hand, in a browser

1. **Sign in** as the seeded admin (`admin@quiz.dev` / `Admin12345` in the demo seed). If the cookie
   does not stick, the page loops back to `/login` — in production that means `WEB_ORIGIN` and the
   address bar disagree, or the site is on plain HTTP and the `Secure` cookie is dropped.
2. **Open `/admin/system`.** The verdict banner should match what `deploy:check` said, the database
   card should name Turso (not `file:`), and the counts should be non-zero if you seeded.
3. **Take a quiz as a student** — enrol, answer, submit. The score must be computed server-side; the
   result page and the leaderboard must agree with it.
4. **Open the same attempt in a second browser context.** It must be a 404, not somebody else's paper.
5. **Sign out.** The cookie is cleared; going back to `/admin` redirects to `/login`.
6. **Watch the API log.** Every request carries an `X-Request-Id` that appears in the log line, so a
   500 reported by a user can be found by id.

### 7.4 The production checklist

The same list is on `/admin/system` and `docs/testing.md`, because a checklist nobody opens is a
checklist nobody runs.

- [ ] `bun run deploy:check` says `ready` (or the warnings are understood).
- [ ] Migrations applied **before** the new API started, and the API log shows no migration attempt.
- [ ] `/api/health/db` reports `turso`, latency in the tens of milliseconds, and counts that match.
- [ ] `deploy:check --url` passes all eight probes against the public hostname.
- [ ] Admin sign-in works; `/admin/system` agrees with the CLI.
- [ ] One real student attempt: start → answer → submit → result → review → leaderboard.
- [ ] An expired attempt is refused, not graded.
- [ ] A second student cannot read the first one's attempt (`404`).
- [ ] The cookie is `HttpOnly; Secure; SameSite=Lax` in the response headers.
- [ ] `JWT_SECRET`, `TURSO_AUTH_TOKEN` and passwords are **not** in the repo, the image or the logs.

---

## 8. The operator console (`/admin/system`)

`GET /api/admin/system` (admin-only, `no-store`) returns one document:

| Field      | Contains                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `service`  | name, version, runtime, `NODE_ENV`, uptime, start time, RSS memory                                               |
| `database` | `target` (`turso` / `file` / `unconfigured`), a redacted `urlHint`, latency, row counts                          |
| `settings` | the effective limits: rate limit, window, registration cap, body cap, session TTL, trusted origins, proxy target |
| `summary`  | the verdict plus the eight checks with their detail and remediation hint                                         |

What it **never** contains: a token, a secret, a password hash, or a full database URL with
credentials. The `urlHint` is produced by `getDatabaseConfig()` with the same redaction the health
probe uses, and a test asserts the serialised response contains none of those strings.

It also answers when the database does not. If the counts query throws, the document still returns
with `connected: false` and `counts: null` — an ops screen that only works while nothing is broken is
useless exactly when it is needed. The readiness probe (`/api/health/db`) is where a `503` belongs.

The page in `apps/web/src/app/admin/system/page.tsx` renders a verdict banner, four stat cards
(database, runtime, limits, session), the check list with remediation for anything not passing, a
"connected to" card, the production checklist and the runbook commands.

---

## 9. Rollback

The processes are stateless; the database is not. Roll back in this order:

1. **Redeploy the previous image/tag.** Both services, or just the one that is failing — the API and
   the web app are coupled only by the proxy target inside the network.
2. **Check `/api/health` and `/api/health/db`.** A previous API against a newer schema is fine only if
   the migration was additive (see below).
3. **Do not revert a migration by hand.** Drizzle migrations are forward-only: the journal records
   what ran. To undo one, write a new migration that reverses it, apply it, and only then redeploy. If
   the change destroyed data, restore from a Turso backup (`turso db shell`, or the dashboard's
   restore) and accept that writes since the backup are gone.
4. **Rotate what leaked.** A secret in a log, an image or a commit is compromised: mint a new Turso
   token, generate a new `JWT_SECRET`, redeploy both services. Rotating the secret signs everybody out
   — that is the point.

**Migration policy:** additive first. Add a column/table, deploy code that writes both, backfill, then
remove the old shape in a later release. That is what makes step 1 possible at all. The schema in this
repo has no destructive migration in its history (`packages/db/migrations`), so a previous API can
always read the current schema.

**Rolling back the web app alone is safe.** It reads the API, never the database. Rolling back the API
alone is safe unless the schema changed; the readiness probe will say so.

---

## 10. Troubleshooting

| Symptom                                                                      | Likely cause                                                                            | Fix                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `deploy:check` says `blocked`, "Database URL is not set"                     | no `.env`, or the variable is named `DATABASE_URL` in a file dotenv did not load        | set `TURSO_DATABASE_URL`; run from the repo root                        |
| API boots, `/api/health` 200, `/api/health/db` 503 `DATABASE_NOT_CONFIGURED` | credentials missing or empty                                                            | fill both values, restart                                               |
| `/api/health/db` 503 `DATABASE_SCHEMA_MISSING`                               | the database exists but no migration ran                                                | `bun run db:migrate`                                                    |
| Every page redirects to `/login` in a loop                                   | `WEB_ORIGIN` does not match the browser's origin, or HTTP with a `Secure` cookie        | set `WEB_ORIGIN` to the exact https origin, serve over HTTPS            |
| Admin pages 403 where they worked locally                                    | the account is not an `ADMIN` — the database row is the authority                       | promote the account, or sign in as the seeded admin                     |
| `403 CROSS_ORIGIN_BLOCKED` on a write                                        | the browser's `Origin` is not in `WEB_ORIGIN`/localhost/preview list                    | add the real origin, no trailing slash                                  |
| Web pages 500 but the API is healthy                                         | the rewrite points at the wrong address, or was built before `API_INTERNAL_URL` was set | rebuild the web app with the right build arg                            |
| Sign-in suddenly `429` in a load test                                        | the per-address limiter, by design                                                      | use `AUTH_RATE_LIMIT_MAX` for the test environment, never in production |
| `✖ Invalid environment configuration` at boot                                | a value failed the Zod schema (`API_PORT` out of range, a bad number)                   | read the printed issue list; every variable has a default               |
| `deploy:check` exits `2`                                                     | the script could not run (bad `--url`)                                                  | pass an absolute `http(s)` URL                                          |
| The landing page shows dashes and "no published question"                    | `/api/landing` could not read the database, or nothing is published                     | read the page's warning bar; then `/api/health/db` and the API log      |
| The landing page prints demo passwords                                       | `DEMO_ACCOUNTS` is unset, and unset means on                                            | set `DEMO_ACCOUNTS=0` before a public deploy                            |

---

## 10a. Mail

The API writes every notification to `email_outbox` before it tries to send, so a
request never depends on a mail server. What happens next is one variable:

| `MAIL_TRANSPORT` | Behaviour                                                              | When to use it                    |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------- |
| `log` (default)  | The whole message goes to the process log and the row is marked `SENT` | Local development, CI, a demo     |
| `webhook`        | `POST { to, from, subject, text }` to `MAIL_WEBHOOK_URL`               | A relay or in-house mailer        |
| `resend`         | Resend's HTTP API (`RESEND_API_KEY`)                                   | A hosted deployment with no relay |

`MAIL_FROM` sets the `From:` line and matters as soon as the transport is real.

Two operational notes:

- **A failed send is visible, not silent.** The row becomes `FAILED` with the
  provider's answer in `error`, and `/admin/emails` shows it next to a **Retry**
  button. Nothing throws into the request that triggered the mail.
- **Delivery is not a deployment gate.** `deploy:check` does not require a
  transport: on `log` the messages are inspectable at `/admin/emails`, which is a
  working (if quiet) configuration rather than a broken one. Set a real transport
  before inviting users who expect email.

The outbox is also the queue: `POST /api/admin/emails/drain` retries everything
still `QUEUED`, bounded per call, and is safe to call from a cron.

## 11. Operational limits (stated, not hidden)

- **Rate limits are in-memory and per process.** Two API instances mean two independent budgets. That
  is deliberate — a shared Redis bucket is not in this stack — and it is why the limiter protects
  accounts (soft, post-password) as well as addresses.
- **The per-address limiter trusts `X-Forwarded-For`.** Behind a proxy that sets it, the bucket is the
  real client. Behind one that appends, a client could vary the header. Terminate at a proxy that
  overwrites it.
- **Sessions are stateless.** Logout clears the cookie; it does not revoke the token server-side
  (documented in `docs/security.md`). The database row check means a deactivated account loses access
  on its next request even though the token is still valid.
- **No metrics, tracing or APM.** The observability is `/api/health`, `/api/health/db`,
  `/api/admin/system`, and one structured log line per request with its request id.
- **SQLite semantics apply.** Turso is a distributed SQLite: one writer at a time, so keep write
  transactions short. Body sizes and rate limits are the guard rails this app needs; there is no job
  queue.
- **The seed is demo data.** Passwords are public in the README, and `/api/landing` republishes the
  ones whose accounts exist. `DEMO_ACCOUNTS=0` turns that off; changing or deleting the seeded accounts
  is the other half of the job.
- **`/api/landing` is public by design.** It exposes counts, one question without its key, one graded
  paper without its student, and the demo logins. If a deployment must not publish any of that, put it
  behind the same proxy auth as the rest of the site — the page degrades to its empty states.

---

## 12. What was verified for this milestone

- `bun run test` — **844** unit/integration tests across the four packages, including the 22 new
  deployment-rule tests, the 7 system-status tests and the 15 presentation-helper tests.
- `bun run test:e2e` — **75** HTTP checks against a live seeded server, including `/api/admin/system`
  (200 with eight checks and no secret in the payload; 403 for a student; 401 anonymous).
- `bun run deploy:check` — the production-shaped environment passes 8/8 and a bare checkout is
  blocked; both paths are exercised by hand in this milestone.
- `bun run build` — the production build of both apps, then `next start` + `tsx src/index.ts` served
  the real seed over HTTP: CSP and HSTS present, a foreign origin blocked, `413` on an oversized body,
  `429` with `Retry-After` after ten bad passwords, and `deploy:check --url` green against it.

See [`docs/testing.md`](testing.md) for the full inventory and the manual QA checklist.
