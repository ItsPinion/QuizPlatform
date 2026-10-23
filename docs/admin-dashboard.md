# Admin console (Day 4)

Day 3 gave the admin namespace a lock. Day 4 fills it: a dashboard that reports the
platform's real numbers, and a user directory you can search, filter and operate on.

Everything here is mounted under `/api/admin`, so the `requireAdmin` guard that Day 3
attached to the router runs **before** any of these handlers — none of them re-checks the
role, and none of them can forget to.

---

## Endpoints

| Method  | Path                   | Purpose                                          |
| ------- | ---------------------- | ------------------------------------------------ |
| `GET`   | `/api/admin/access`    | Scope descriptor (Day 3) — proof the guard ran   |
| `GET`   | `/api/admin/stats`     | Dashboard aggregates + newest users and attempts |
| `GET`   | `/api/admin/users`     | Paged, filtered, sorted user directory           |
| `GET`   | `/api/admin/users/:id` | One user with attempt statistics                 |
| `PATCH` | `/api/admin/users/:id` | Change a role and/or status                      |

All four Day 4 routes answer `403 FORBIDDEN` for a student session and `401
UNAUTHENTICATED` without a session, even when the path does not exist — the guard is
mounted on `*`, not per route.

---

## Statistics

`GET /api/admin/stats` returns one payload assembled from a fixed number of aggregate
queries. It is deliberately **not** one request per card.

```json
{
  "generatedAt": "2026-10-23T09:15:02.118Z",
  "users": {
    "total": 4,
    "active": 4,
    "inactive": 0,
    "admins": 1,
    "students": 3,
    "joinedLast7Days": 0
  },
  "content": {
    "categories": 10,
    "quizzes": 10,
    "published": 8,
    "drafts": 1,
    "unpublished": 1,
    "questions": 47,
    "options": 188
  },
  "attempts": {
    "total": 14,
    "inProgress": 0,
    "passed": 8,
    "failed": 6,
    "expired": 0,
    "learners": 3,
    "averagePercentage": 68.2,
    "passRate": 57.1
  },
  "recentUsers": [{ "id": "…", "name": "Alex Admin", "role": "ADMIN", "createdAt": "…" }],
  "recentAttempts": [{ "userName": "Rahul", "quizTitle": "HTML Fundamentals", "percentage": 80 }]
}
```

Every derived number has an explicit definition, because a dashboard that quietly changes
what "pass rate" means is worse than no dashboard:

| Field                        | Definition                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `users.inactive`             | `total − active` (derived, so the two can never disagree)                       |
| `users.students`             | `total − admins`                                                                |
| `users.joinedLast7Days`      | `createdAt >= now − 7 days`                                                     |
| `attempts.learners`          | `count(distinct userId)` over attempts — students who actually started one      |
| `attempts.passRate`          | `passed / (passed + failed + expired)`, one decimal; `0` when nothing is graded |
| `attempts.averagePercentage` | mean of the stored `percentage` over graded attempts, one decimal               |

`inProgress` attempts are excluded from `averagePercentage` and `passRate`: an unfinished
attempt has a score of zero, and counting it would make the platform look like it is
failing its students.

The response is parsed through `dashboardStatsSchema` before it leaves the API, so a
missing section or an unknown attempt status is a server error, not a silent `undefined` in
the UI.

---

## User directory

`GET /api/admin/users` accepts:

| Query      | Type                                         | Default  | Notes                                   |
| ---------- | -------------------------------------------- | -------- | --------------------------------------- |
| `search`   | string (≤120)                                | —        | `LIKE` on name **or** email             |
| `role`     | `ADMIN` \| `STUDENT`                         | —        |                                         |
| `status`   | `ACTIVE` \| `INACTIVE`                       | —        |                                         |
| `sort`     | `newest` \| `oldest` \| `name` \| `attempts` | `newest` | `attempts` sorts by the aggregate       |
| `page`     | integer ≥ 1                                  | `1`      |                                         |
| `pageSize` | integer 1–50                                 | `10`     | `pageSize=500` → `422 VALIDATION_ERROR` |

Empty values (`?role=&search=`) are treated as absent, because that is what a cleared
HTML filter form submits.

Each row carries attempt aggregates from a single `LEFT JOIN … GROUP BY users.id`:

```ts
{
  (id,
    name,
    email,
    role,
    status,
    createdAt, // the safe columns
    attempts, // every attempt, including in-progress ones
    completedAttempts, // PASSED + FAILED + EXPIRED
    bestPercentage, // max score over graded attempts, or null
    lastAttemptAt); // ISO timestamp, or null
}
```

`passwordHash` is not selected at all — the row shape is the security boundary, not a
`delete user.passwordHash` afterwards. A test asserts the raw response body never contains
the string.

---

## Changing a user

```http
PATCH /api/admin/users/:id
Content-Type: application/json

{ "role": "ADMIN" }      // or { "status": "INACTIVE" }, or both
```

The body is validated by `updateUserSchema` through Hono's JSON validator, which is what
gives the web client its inferred `json` payload type:

| Input                  | Result                                            |
| ---------------------- | ------------------------------------------------- |
| `{}`                   | `422 VALIDATION_ERROR` — "Provide role or status" |
| unknown keys (`email`) | stripped, never written                           |
| invalid enums          | `422 VALIDATION_ERROR`                            |
| malformed JSON         | `400 INVALID_JSON`                                |
| unknown `:id`          | `404 USER_NOT_FOUND`                              |
| non-UUID `:id`         | `422 VALIDATION_ERROR`                            |

### The one rule: you cannot lock yourself out

An admin cannot demote or deactivate **the account they are signed in with**:

```json
{
  "error": {
    "code": "SELF_LOCKOUT",
    "message": "You cannot demote or deactivate the account you are signed in with."
  }
}
```

It is `409`, not `403`: the request is well formed and the caller is allowed to make it —
it is the resulting state that is refused.

Because every caller of this route is an active admin, that single rule is also the
"at least one administrator must remain" invariant: any _other_ admin can still be demoted,
and the admin doing it stays active. There is no separate last-admin counter to keep in
sync with reality.

Deactivation takes effect on the very next request. `requireAuth` re-reads the user row on
every guarded call (Day 3), so an already-issued cookie stops working immediately:

```
PATCH { "status": "INACTIVE" }   → 200
GET /api/auth/me (their cookie)  → 403 ACCOUNT_INACTIVE
PATCH { "status": "ACTIVE" }     → 200
GET /api/auth/me (same cookie)   → 200
```

The second and third steps are covered by both a Vitest test and an end-to-end check.

---

## The web console

```
/admin                  AdminLayout (header + sidebar) → overview
/admin/users            same shell → directory
```

**`app/admin/layout.tsx`** renders chrome only — header, sidebar, content column. It does
not guard, deliberately: a layout never sees the request pathname, so a guard there could
only ever redirect to `/admin`, losing the `?next=` of the page the visitor actually asked
for. Each page runs `decideAccess(session, 'ADMIN', <its own path>)` instead.

**Overview** (`/admin`) renders six `StatCard`s, an account-mix card with proportion bars,
the five newest accounts and the five most recent attempts. Every number comes from the one
`/api/admin/stats` call.

**Users** (`/admin/users`) is a server component:

1. `parseUserFilters(searchParams)` normalises the URL into a typed filter object —
   unknown values fall back to defaults rather than throwing, so a hand-edited URL still
   renders.
2. The filters are forwarded to the API through the cookie-carrying `serverApi()` client.
3. The table is rendered on the server; only the action buttons are a client component.

Filters live entirely in the URL (`?search=&role=&status=&sort=&page=`), so a filtered view
is a link you can share, and the back button works. The filter form is a plain
`<form method="get">` — no JavaScript needed to apply it.

`UsersTable` (client) sends the `PATCH` through `hc<AppType>` and then calls
`router.refresh()`, which re-renders the server component so counts and pagination stay
truthful after a change. The signed-in admin's own row has its buttons disabled, mirroring
the API rule instead of discovering it through a 409.

### Failure states

| Situation                      | What the console does                                         |
| ------------------------------ | ------------------------------------------------------------- |
| API unreachable / DB not ready | Overview explains it and links `/api/health/db`; no crash     |
| Directory request fails        | "could not be loaded" card with the probe link                |
| No rows match                  | Empty state suggesting clearing the filters                   |
| `PATCH` rejected (409/422/403) | The API's message is shown in an inline alert above the table |

---

## Tests

| Layer  | File                                         | Covers                                                                                                         |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| API    | `apps/api/src/__tests__/admin-users.test.ts` | 30 tests: stats arithmetic, directory filters/search/sort/paging, secrets, every `PATCH` rule                  |
| Shared | `packages/shared/src/admin.test.ts`          | 18 tests: query coercion, update-body refine, stats/list contracts                                             |
| Web    | `apps/web/src/lib/admin-params.test.ts`      | 26 tests: filter parsing, href round-trips, range labels, initials                                             |
| E2E    | `scripts/e2e-smoke.ts`                       | 8 Day-4 checks over real HTTP: aggregates, 403s, filters, promote/demote, `SELF_LOCKOUT`, deactivation lockout |

Run them with:

```bash
bun run test        # 258 Vitest tests
bun run test:e2e    # 25 checks against a live API + throwaway database
```
