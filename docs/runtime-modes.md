# Runtime modes — what a deployment is allowed to show

One variable decides whether this build behaves like a product or like a showcase:

```bash
ENV_NODE=production   # the default, including when the variable is missing
ENV_NODE=development  # a laptop or CI: demo logins, build-plan badges, preview origins
ENV_NODE=demo         # a deployment meant to be shown: the same, kept on deliberately
```

`ENV_NODE` is deliberately **not** `NODE_ENV`. `NODE_ENV` already has a job — Secure cookies,
React's development validations, how Next.js builds — and conflating the two is how a demo login
ends up on a real deployment. They are read separately, and only one of them can publish a password.

## Why the default is production

The switch turns _on_ features that hand out credentials. A switch like that has to fail closed:

| `ENV_NODE`         | `NODE_ENV`    | Resolved mode                                 |
| ------------------ | ------------- | --------------------------------------------- |
| unset              | unset         | **production**                                |
| unset              | `production`  | **production**                                |
| unset              | `development` | development                                   |
| unset              | `test`        | development (a test run is a development run) |
| `PROD` / `prod`    | anything      | **production** (accepted spelling)            |
| `development`      | anything      | development                                   |
| `demo`             | anything      | demo                                          |
| `staging` (a typo) | `development` | **production**, with a warning at boot        |

Two rules make this safe rather than merely convenient:

1. **An explicit `ENV_NODE` always wins**, in either direction. `ENV_NODE=production NODE_ENV=development`
   is a production process.
2. **An unrecognised `ENV_NODE` falls back to production** and prints
   `⚠ ENV_NODE="staging" is not understood (expected production | development | demo)`.
   A typo can therefore never _widen_ what a deployment shows. It narrows it.

The implementation is one pure function, `readRuntimeMode({ ENV_NODE, NODE_ENV })` in
`packages/shared/src/environment.ts`, so the API, the web app, `bun run deploy:check` and the test
suite all answer the question the same way. Nothing reads `process.env` twice with two different
sets of rules.

## What each mode changes

| Surface                                              | production | development | demo |
| ---------------------------------------------------- | :--------: | :---------: | :--: |
| Seeded demo logins on `/`, `/login`, `/api/landing`  |     —      |      ✓      |  ✓   |
| `Day N · …` build-plan badges in the console         |     —      |      ✓      |  ✓   |
| `<host>.e2b.app` / `.arena.ai` preview origins       |     —      |      ✓      |  ✓   |
| `http://localhost:3000` in the CORS/origin allowlist |     —      |      ✓      |  ✓   |
| Pretty-printed JSON and the request log              |     —      |      ✓      |  ✓   |
| `target: 'file'` reported by `/api/health/db`        |     —      |      ✓      |  ✓   |
| `bun run db:seed` against a **remote** database      |  refuses¹  |      ✓      |  ✓   |

¹ `db:seed` writes fictional students and graded attempts. Targeting Turso from a production
environment is refused unless `--force` is passed, because that is already the "I mean it" flag for
reseeding.

`DEMO_ACCOUNTS=0` still hides the credentials **inside** development and demo. It cannot publish
them from production — there is no flag for that. The decision is
`demoAccountsEnabled(mode, flag)`, and the production branch returns `false` before the flag is
consulted.

## Where the gate lives

```
ENV_NODE ──► packages/shared/src/environment.ts ──┬─► apps/api/src/lib/env.ts
                                                  │      runtimeMode · developmentFeatures · demoAccounts
                                                  │      allowedOrigins · isAllowedOrigin
                                                  │
                                                  ├─► apps/web/src/lib/runtime.ts
                                                  │      developmentFeatures (server components only)
                                                  │
                                                  └─► scripts/deploy-check.ts
                                                         the "Demo surface" rule
```

Three consequences worth knowing:

- **The API is the authority for credentials.** `/api/landing` carries
  `runtime: { mode, demoFeatures }`, and the landing page, the CTA band and the login screen render
  from that payload. A demo login can never appear because of a variable the API disagrees with. The
  web app reads its own `ENV_NODE` for one thing only — the build-plan badges, which have no API
  payload to hang off — and `/admin/system` prints both, so a split environment is visible instead
  of silently half-on. Pass `ENV_NODE` to **both** processes in a split deployment.
- **The UI gate is a server component.** `BuildBadge` (`apps/web/src/components/build-badge.tsx`)
  returns `null` in production. The label stays in the page source next to the page it describes;
  only the rendered badge is conditional.
- **The origin policy is a pure function.** `originAllowed(origin, policy)` takes the allowlist and a
  `allowPreviewHosts` boolean, so the production answer is tested in the same process as the
  development one (`apps/api/src/__tests__/origins.test.ts`). Preview hosts are a sandbox convenience:
  this repository is developed on `https://<port>-<id>.e2b.app`, where the browser's `Origin` cannot
  be `localhost`. A production deployment trusts `WEB_ORIGIN` only.

## Operator surfaces

| Where                   | What it says                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/meta`         | `runtime: { mode, demoFeatures }`                                                                   |
| `GET /api/health`       | version, runtime; `/api/health/db` adds the database `target` outside production                    |
| `GET /api/landing`      | `runtime`, and `demo.enabled` (false in production, always)                                         |
| `GET /api/admin/system` | `service.runtimeMode`, `service.demoFeatures`, `settings.demoAccounts`, and a **Demo surface** rule |
| `bun run deploy:check`  | the same rule, before a build                                                                       |

## Common setups

**A laptop.**

```bash
bun run dev          # both dev scripts set ENV_NODE=development
```

Nothing else is needed: the demo logins work, the badges are there, the sandbox preview origin is
trusted.

**A showcase deployment** (the demo, on purpose).

```bash
ENV_NODE=demo
DEMO_ACCOUNTS=1
NODE_ENV=production      # still production: Secure cookies, no dev React
```

The `deploy:check` verdict will read `attention` rather than `ready` — that is the intended signal
that a deployment is publishing credentials.

**A real deployment.**

```bash
# leave ENV_NODE unset
NODE_ENV=production
WEB_ORIGIN=https://quiz.example.com
```

No demo logins, no badges, no preview origins, no pretty JSON, no request log. `deploy:check`
reports the demo surface as `pass`.

**Running the production build locally** to check it:

```bash
bun run --filter=@quiz/web build
bun run --filter=@quiz/api start     # no ENV_NODE → production
bun run --filter=@quiz/web start
```

Expect the demo logins to be gone. That is the point of the check.

## Tests

`packages/shared/src/environment.test.ts` covers the resolution table (including the typo case and
the `test` → development mapping) and both feature gates. `apps/api/src/__tests__/origins.test.ts`
covers the origin policy in both modes and asserts the suite itself runs as a development surface.
`packages/shared/src/deployment.test.ts` covers the new deployment rule. The full inventory is in
[`testing.md`](testing.md).
