# Authorization

Day 3 splits the product into two areas — **ADMIN** and **STUDENT** — and enforces the split twice:
once when a request reaches the API, and once before a page renders. Neither layer trusts the other.

---

## The rule

| Role      | May call                        | Lands on   | Permissions                                                                                 |
| --------- | ------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `STUDENT` | `/api/student/*`, `/api/auth/*` | `/student` | `quizzes:take`, `results:read`, `leaderboard:read`                                          |
| `ADMIN`   | `/api/admin/*`, `/api/auth/*`   | `/admin`   | `quizzes:manage`, `questions:manage`, `categories:manage`, `users:manage`, `analytics:read` |

The areas are **exclusive**: an admin is not automatically a student and vice versa. Anything that
both roles need (health checks, `/api/auth/*`, the public landing page) stays outside the namespaces.

---

## API enforcement

```
/api/admin/*    →  requireAdmin     (authenticate + role ADMIN)
/api/student/*  →  requireStudent   (authenticate + role STUDENT)
```

`apps/api/src/middleware/auth.ts` builds every guard from one `authenticate()` step, so the session
rules cannot drift between routes:

1. **Token** — `readSessionToken()` takes the `quiz_session` cookie, or an `Authorization: Bearer`
   header for tooling.
2. **Signature & expiry** — `verifySession()` checks HS256 and `exp`. Anything untrustworthy becomes
   `401 INVALID_SESSION`, never a partial identity.
3. **User row** — the id from the token is re-read from the database. Deleted users get `401`, and a
   status other than `ACTIVE` gets `403 ACCOUNT_INACTIVE`. A token alone is never enough.
4. **Role** — `assertRole()` compares against the namespace's allowed roles.

The namespaced guards are mounted on the **router**, not on individual handlers:

```ts
export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAdmin);
```

That ordering matters. The Day 4 routes (`GET /api/admin/stats`, `GET`/`PATCH
/api/admin/users/:id`) were added without touching the guard and were protected the moment they
existed — there is no decorator to forget. See
[`admin-dashboard.md`](admin-dashboard.md) for what they do. It also means guards run **before** route
matching: an unauthorised caller asking for `/api/admin/does-not-exist` gets `401`/`403`, not a `404`
that would confirm which paths exist.

### Scope descriptor

Both namespaces expose their own access endpoint, which the web app uses to render role-appropriate
navigation instead of re-deriving `role === 'ADMIN'` checks in components:

```http
GET /api/admin/access      (ADMIN only)
GET /api/student/access    (STUDENT only)
```

```json
{
  "scope": "STUDENT",
  "user": { "id": "…", "email": "rahul@quiz.dev", "role": "STUDENT", "status": "ACTIVE", "…": "…" },
  "permissions": ["quizzes:take", "results:read", "leaderboard:read"]
}
```

The permission lists live in `packages/shared/src/auth.ts` (`PERMISSIONS`), so the API and the web app
read the same constant.

### Adding a protected route

```ts
// apps/api/src/routes/admin.ts — already wrapped by requireAdmin
adminRoutes.get('/quizzes', async (c) => {
  const admin = c.get('user'); // typed AuthUser, guaranteed role ADMIN
  …
});
```

For a one-off route outside the namespaces:

```ts
app.get('/api/reports', requireAuth, requireRole('ADMIN'), handler);
```

---

## Web enforcement

The cookie is `HttpOnly`, so a React component cannot read it — and it should not try. The pages are
guarded **on the server**, before anything is sent to the browser:

```
server component
  └─ getSession()            lib/session.ts   cookie → /api/auth/me (cache: 'no-store')
      └─ decideAccess()      lib/guards.ts    no session → /login?next=<target>
                                              wrong role → that role's own area
                                              match      → render
```

- `getSession()` returns `null` for anonymous visitors, expired or tampered cookies, deleted users,
  and an unreachable API. Every one of those is a redirect to sign-in, never a crash.
- `decideAccess(session, requiredRole, target)` is a pure function, so the routing rule is unit
  tested instead of being inferred from rendered HTML.
- `/login?next=…` is filtered by `safeNextPath()`: only same-origin absolute paths survive. Absolute
  URLs, protocol-relative URLs (`//evil.com`), backslash tricks, schemes and control characters all
  fall back to `/`. Without this, `?next=` would be an open redirect handed to a victim right after
  they authenticate.

The UI still shows the link only for the right role (header: **Admin area** / **My area**), but that
is cosmetic — the API rejects the request regardless of what the browser renders.

---

## Failure modes

| Where | Situation                                | Result                                         |
| ----- | ---------------------------------------- | ---------------------------------------------- |
| API   | no cookie / Bearer                       | `401 UNAUTHENTICATED`                          |
| API   | bad signature, expired, user gone        | `401 INVALID_SESSION`                          |
| API   | account disabled                         | `403 ACCOUNT_INACTIVE`                         |
| API   | signed in with the wrong role            | `403 FORBIDDEN`                                |
| API   | authenticated + right role, unknown path | `404 NOT_FOUND` (error envelope)               |
| Web   | no session on `/admin` or `/student`     | `307` → `/login?next=%2F<area>`                |
| Web   | wrong role for the area                  | `307` → the role's own area (no redirect loop) |
| Web   | `?next=` not a same-origin path          | ignored, falls back to `/`                     |
| Web   | API unreachable                          | treated as signed out → `/login?next=…`        |

---

## Tests

| Suite                                          | Covers                                                                                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/__tests__/authorization.test.ts` | both scopes for both roles, opposite-role 403s, anonymous 401, forged cookie, deactivated admin, guard-before-404, guards exercised standalone |
| `apps/web/src/lib/guards.test.ts`              | `decideAccess` routing and `safeNextPath` attack strings                                                                                       |
| `scripts/e2e-smoke.ts`                         | 17 real-HTTP checks, including both role denials                                                                                               |

Manual checks are listed in [`testing.md`](testing.md#manual-qa-checklist).
