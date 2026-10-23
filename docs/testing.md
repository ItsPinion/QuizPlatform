# Testing

Two layers, both runnable from the repo root:

```bash
bun run test       # 338 unit + integration tests across the four workspaces
bun run test:e2e   # 34 checks against a real HTTP server (own process, own port)
```

Neither touches Turso. Every suite builds a throwaway `file:` database in `.data/` with the project's
own toolchain (`drizzle-kit migrate`, then the seed script) and deletes it afterwards, so the SQL that
ships is the SQL that is verified. The Turso-only rule applies to the running application, not to
tests.

---

## What runs where

| Workspace      | Tests | Focus                                                                                    |
| -------------- | ----- | ---------------------------------------------------------------------------------------- |
| `@quiz/shared` | 67    | scrypt + auth contracts, admin schemas, quiz slugs and lifecycle rules                   |
| `@quiz/db`     | 58    | migrations replayed from scratch, schema constraints, seed integrity, Drizzle Kit wiring |
| `@quiz/api`    | 147   | health/readiness, auth flows, session forgery/expiry, guards, stats/users/quizzes        |
| `@quiz/web`    | 66    | error envelopes, page guards, user-directory and quiz-screen parameter helpers           |

Run one workspace at a time when you are iterating:

```bash
bun run test --filter=@quiz/api
bun run test --filter=@quiz/web
```

### Auth coverage in detail

- **Registration** — 201 + cookie, scrypt hash on disk (never the password), email lowercased,
  client-supplied `role` stripped, duplicate email (also when only the casing differs) → 409, weak
  password → 422, >128 characters → 422, malformed/missing JSON → 400, distinct salts for identical
  passwords.
- **Login** — seeded admin and student, wrong password → 401, unknown email answers byte-identically
  to a wrong password, `INACTIVE` → 403, no cookie is issued on failure.
- **Session** — `/me` with cookie, with `Authorization: Bearer`, without either (401), tampered
  signature (401), expired token (401), token signed with a foreign secret (401), payload missing
  `role` (401), user deleted after login (401), user deactivated after login (403).
- **Logout** — clears the cookie with `Max-Age=0` on `Path=/`, idempotent without a session, and a
  replayed token still works (stateless sessions — see the security notes below).
- **Guards** — `requireRole` allows the matching role, returns 403 `FORBIDDEN` for a different one,
  and 401 when no user is attached.
- **Role namespaces (Day 3)** — `/api/admin/access` and `/api/student/access` answer 200 with the
  right scope descriptor and permissions for the matching role, 403 for the opposite role, 401
  anonymously, 401 on a forged cookie, and 403 `ACCOUNT_INACTIVE` for a deactivated admin. The guard
  runs before route matching (unknown admin paths answer 401/403 to the wrong caller, 404 to the
  right one), and `requireAdmin` / `requireStudent` are also exercised standalone.
- **Page guards** — see [`authorization.md`](authorization.md) for the rule itself; `decideAccess` sends anonymous visitors to `/login?next=…` (URL-encoded),
  redirects a student off `/admin` and an admin off `/student`, and allows the matching role.
  `safeNextPath` rejects absolute URLs, protocol-relative URLs, backslash tricks, schemes, control
  characters and repeated query keys.
- **Cookie attributes** — `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800`; `Secure` is
  asserted in both branches (absent in development, present when TLS is in play).

### Admin console coverage (Day 4)

- **Statistics** — counts agree with the database, `active + inactive = total`,
  `admins + students = total`, quiz statuses add up, the pass rate and average score stay inside
  0–100 with one decimal, the newest-five strips are ordered, and a freshly created account shows up
  in the next read.
- **Directory** — pagination metadata, both sorts (name and attempt count), role and status filters,
  case-insensitive name _and_ email search, an empty page for a search with no matches, empty values
  treated as absent, `422` for an out-of-range `pageSize` and for an unknown role, and a raw-body
  assertion that no payload contains `passwordHash`.
- **Detail & mutation** — single-user lookup with attempt stats, `404 USER_NOT_FOUND`, `422` for a
  non-UUID id, promote → demote round trip, deactivate → reactivate (including the session lockout in
  between), role + status in one request, `409 SELF_LOCKOUT` for self-demotion and self-deactivation,
  an admin deactivating a _different_ admin, `422` for an empty body or a bad enum, `400 INVALID_JSON`
  for a malformed body, and 401/403 on every route.
- **Contracts** — `userListQuerySchema` defaults/coercion/clamping, `updateUserSchema` refusing an
  empty body while stripping fields it must not write, the credential-free user shape, and the list
  and stats response schemas (including rejecting an unknown attempt status).
- **Web parameters** — filter parsing with fallbacks, `toUserQuery`, `usersHref` round-trips and
  percent-encoding, filter summaries, `rangeLabel` past the end, initials, and relative-day labels.

### Quiz management coverage (Day 5)

- **Directory** — status/difficulty/category filters, case-insensitive title search, both sorts,
  pagination, cleared filters, and 422s for unknown statuses, difficulties and page sizes.
- **Aggregates** — `questionCount` and `attemptCount` are counted `distinct`, so two joins do not
  multiply each other; the test compares the API's number with the rows actually in the table.
- **Creation** — derived slug, `-2` suffix on a duplicate title, create-time defaults, blank
  description/thumbnail becoming `null`, unknown category → 422, and the whole validation matrix
  (short title, duration 0/181, score 101, attempts 0/11, bad URL).
- **Editing** — partial updates leave other columns alone, the slug survives a rename, a quiz can
  move category, `{}` → 422, unknown category → 422, unknown quiz → 404.
- **Lifecycle** — publish needs a question, publishing twice is idempotent, unpublishing a draft is
  409, republishing works, and all of it is 403 for a student.
- **Deletion** — cascades questions for an untouched quiz, refuses with `QUIZ_HAS_ATTEMPTS` when
  attempts exist (and leaves the quiz in place), 404 for unknown ids.
- **Contracts** — `slugify` (case, punctuation, accents, length cap), `uniqueSlug` (suffixes, `quiz`
  fallback, `Set` input), create defaults, update-without-defaults, list query defaults, and the
  `canPublish` / `canDelete` helpers.

---

## End-to-end smoke run

`bun run test:e2e` (source: `scripts/e2e-smoke.ts`) covers what unit tests cannot: a real process
started with `serve()`, real sockets, and real `Set-Cookie` handling through `fetch`.

It migrates and seeds `.data/e2e-<pid>.db`, starts the API on a free port with its own `JWT_SECRET`,
then asserts:

1. `/api/health` → 200
2. `/api/health/db` → 200 with seeded counts
3. register → 201 + `HttpOnly`/`SameSite` cookie
4. `/api/auth/me` with the cookie → 200
5. `/api/auth/me` without a cookie → 401
6. tampered cookie → 401
7. admin login → 200 with `ADMIN`
8. wrong password → 401
9. duplicate registration → 409
10. weak password → 422
11. `/api/admin/access` → 200 for the admin
12. `/api/admin/access` → 403 for the student
13. `/api/student/access` → 403 for the admin
14. `/api/student/access` → 200 for the student
15. role-scoped routes → 401 anonymously
16. `/api/admin/stats` → 200 with consistent aggregates and a 0–100 pass rate
17. `/api/admin/stats` → 403 for the student
18. `/api/admin/users?search=rahul&role=STUDENT` → 200, one match, no `passwordHash` in the body
19. `/api/admin/users?pageSize=500` → 422 `VALIDATION_ERROR`
20. promote → demote the e2e account through `PATCH` → 200 and 200
21. admin demoting themselves → 409 `SELF_LOCKOUT`
22. deactivation → the victim's next request is 403 `ACCOUNT_INACTIVE`, and reactivation restores it
23. `/api/admin/users` → 403 for the student
24. `/api/admin/categories` → 200 with the seeded categories
25. `/api/admin/quizzes` → 200 with joined aggregates
26. create a quiz → 201, `DRAFT`, slug derived from the title
27. `PATCH` it → 200, title and duration updated, slug unchanged
28. publish it → 409 `QUIZ_HAS_NO_QUESTIONS`
29. a seeded draft publishes and then unpublishes
30. deleting an attempted quiz → 409 `QUIZ_HAS_ATTEMPTS`
31. deleting the created quiz → 200, then `GET` → 404
32. quiz management → 403 for the student
33. logout → 200 with `Max-Age=0`
34. unknown route → 404 `NOT_FOUND`

It prints a pass/fail table, exits non-zero on failure, and removes the database afterwards.

---

## Manual QA checklist

Useful after changing auth, the proxy, or the cookie. Start with `bun dev`, then:

- [ ] `/login` renders two demo accounts and the form is keyboard-navigable.
- [ ] Wrong password → inline “Email or password is incorrect.”, no navigation.
- [ ] `admin@quiz.dev` / `Admin12345` → redirects to `/`, header shows the name, an `ADMIN` badge and
      **Sign out**.
- [ ] DevTools → Application → Cookies: `quiz_session` is `HttpOnly` and `Lax`; `document.cookie`
      cannot see it.
- [ ] Reload → still signed in (cookie survives), header resolves without a flash of “Sign in”.
- [ ] **Sign out** → header returns to _Sign in / Create account_; the cookie is gone.
- [ ] `/register` with a weak password keeps the submit disabled and lists the unmet rules.
- [ ] Registering a duplicate email shows “An account with this email already exists.”
- [ ] Sign in, then set the user to `INACTIVE` in the database → the next request answers 403 and the
      header drops the session.
- [ ] `/admin` while signed out → `/login?next=%2Fadmin`; signing in as the seeded admin returns to
      `/admin`.
- [ ] `/admin` while signed in as `rahul@quiz.dev` → redirected to `/student` (and the reverse for an
      admin opening `/student`).
- [ ] `curl` the namespaces with each cookie: `200` for the matching role, `403 FORBIDDEN` otherwise,
      `401` without a cookie.
- [ ] `/login?next=https://evil.example` still redirects to `/` after signing in.
- [ ] The landing page **Runtime checks** card shows the user, role and expiry for a signed-in session.
- [ ] Sign in as the admin → `/admin` shows six stat cards, the account mix and the recent attempts;
      `/api/admin/stats` in a second tab returns the same numbers.
- [ ] `/admin/users` lists four seeded accounts; searching `priya` narrows to one, and the URL keeps
      `?search=priya` so a reload reproduces the view.
- [ ] Filter by `INACTIVE` → empty state with a working **Clear** link.
- [ ] Deactivate a student → their row flips to `INACTIVE`, then reactivate it.
- [ ] Try to deactivate or demote your own row → the buttons are disabled, and forcing the PATCH with
      `curl` answers `409 SELF_LOCKOUT`.
- [ ] Promote a student to `ADMIN`, open `/admin` in their browser → it now renders; demote them and
      the next request is `403 FORBIDDEN`.
- [ ] `/admin/quizzes` lists ten seeded quizzes; filtering by `DRAFT` and by a category narrows the
      table, and the URL keeps the filters across a reload.
- [ ] Create a quiz → it lands on its edit page as a `DRAFT` with a derived slug; the **Publish**
      button is disabled with "Add at least one question first".
- [ ] Rename the quiz → the title changes, the slug in the header does not.
- [ ] Publish a seeded draft with questions → the badge turns green; unpublish → it turns grey.
- [ ] Try to delete a quiz that has attempts → the button is disabled and says why; `curl` the same
      `DELETE` and get `409 QUIZ_HAS_ATTEMPTS`.
- [ ] Delete a freshly created quiz → it disappears and the API then answers `404`.

---

## Security notes and known trade-offs

- Passwords use scrypt (`N=16384, r=8, p=1`, 64-byte key, 16-byte random salt) — no native build
  step, no plaintext fallback.
- Sessions are **stateless**: logout clears the cookie, but a copied token remains valid until its
  `exp` (7 days). Server-side revocation (session ids or a token-version column) is Day 13 work.
- The login endpoint runs a decoy scrypt verification for unknown emails so response timing does not
  enumerate accounts.
- `requireAuth` re-reads the user row, so deleting or deactivating an account takes effect on the next
  request rather than at token expiry.
- Authorization happens on the server: the web guards read the session through the API, so hiding a
  link is never the only protection — the API rejects the request regardless of the UI.
- CSRF: the cookie is `SameSite=Lax`, requests require JSON bodies, and every state-changing route is
  POST-only. A double-submit token can be layered on in Day 13 if the deployment needs it.
- `JWT_SECRET` is mandatory in production (the API exits at boot without a 32+ character secret);
  local development falls back to a warned-about secret so `bun dev` works out of the box.
