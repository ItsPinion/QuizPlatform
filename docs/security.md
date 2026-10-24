# Security & testing (Day 13)

Day 13 of the spec asks for nine things to be tested: authentication, authorization, quiz creation,
quiz attempts, the timer, score calculation, API validation, unauthorized access and input validation.
A day that only _tested_ would leave the platform exactly as it was, so this milestone does both: it
adds the controls that were missing, and it attacks all nine areas on purpose.

- `apps/api/src/__tests__/security.test.ts` — **51 adversarial tests**, one group per spec area.
- `apps/api/src/lib/rate-limit.ts`, `apps/api/src/middleware/origin.ts`,
  `apps/web/src/lib/security-headers.ts` — the new controls.
- `docs/testing.md` — the full inventory; this page is the _why_.

---

## 1. The threat model

The system has two untrusted parties and one careless one.

| Party             | Capability                                                               | What they must not manage                                                                        |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Anonymous visitor | Can reach every `/api` endpoint; can guess passwords; can send any bytes | Read anyone's data, create an admin, cost unbounded work per request                             |
| Signed-in student | Holds a real session cookie                                              | Read or write another student's attempt, promote themselves, change a stored score, edit content |
| Administrator     | Full content and user control                                            | Escalate beyond the admin scope (self-lockout, silent role writes)                               |
| The app itself    | Renders user-authored text and JSON                                      | Execute submitted markup, cache one person's data for another                                    |

Everything below is a control against one of those rows.

---

## 2. What every request passes through

`apps/api/src/app.ts` chains the middleware in this order, and each step can stop the request:

```
requestId → security headers → Cache-Control: no-store → body limit (64 KB)
         → same-origin guard → CORS → logger → route guard (requireAuth / requireRole)
         → Zod validation (body · query · param) → handler
```

| Step              | Where                                 | Refuses with                                                  |
| ----------------- | ------------------------------------- | ------------------------------------------------------------- |
| Body limit        | `hono/body-limit`                     | `413 PAYLOAD_TOO_LARGE`                                       |
| Same-origin guard | `middleware/origin.ts`                | `403 CROSS_ORIGIN_BLOCKED`                                    |
| Session + role    | `middleware/auth.ts`                  | `401 UNAUTHENTICATED` / `403 FORBIDDEN`                       |
| Validation        | `lib/errors.ts#jsonBody`, Zod schemas | `422 VALIDATION_ERROR`                                        |
| Errors            | `lib/errors.ts#errorHandler`          | `{ error: { code, message, details? } }`, never a stack trace |

---

## 3. Authentication

- **Passwords** are scrypt (`N=16384, r=8, p=1`, 64-byte key, 16-byte salt) with a per-record salt,
  stored as `scrypt$N$r$p$salt$hash`. Verification is `timingSafeEqual`; a corrupt record fails closed.
- **No user enumeration.** An unknown email is verified against a throwaway decoy hash, so it costs
  the same wall time as a wrong password, and both answer with a byte-identical `401`.
- **The JWT is scoped.** HS256, `iss: quiz-api`, `aud: quiz-web`, `exp` seven days out. A token minted
  by another service that happens to share the secret is refused, and so is one carrying the wrong
  audience — both are `INVALID_SESSION`.
- **`alg: none` is dead on arrival.** Verification demands HS256 by name; there is no algorithm
  negotiation to confuse.
- **The cookie** is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, `Max-Age` = the token
  TTL. Clearing it uses the same path, so the browser really forgets it.
- **The database row is the authority.** Every protected request re-reads the user, so a deleted or
  deactivated account loses access on its next call rather than when the token expires.

The suite proves each of these, including the two forgery paths: a foreign `aud`, a foreign `iss`, and
an unsigned `none` token.

---

## 4. Authorization

Two namespaces (`/api/admin`, `/api/student`), one guard per namespace, and the **stored role** decides
— not the role claim inside the token. A token signed by us that claims `ADMIN` for a `STUDENT` row is
still refused at `/api/admin/stats`, and `/api/auth/me` reports the real role.

The suite walks the read endpoints of both namespaces in both directions (a student at every admin
route, an admin at every student route), then does the same for writes. `SELF_LOCKOUT` separately
stops an administrator from demoting or deactivating themselves.

---

## 5. Quiz creation, attempts, timer and scoring

Day 13's contribution here is mass assignment: every create and update schema is strict, so fields the
server owns — `id`, `status`, `slug`, `attemptCount`, `createdAt`, `score`, `percentage` — are dropped
before they reach the database.

| Attempt                                         | Result                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Create a quiz with `status: 'PUBLISHED'`        | stored as `DRAFT`                                                              |
| Create a quiz with a hand-picked `id` or `slug` | both generated by the server                                                   |
| Submit with `score: 999, percentage: 100`       | graded from the answers: `0`, `FAILED`                                         |
| Start with `expiresAt: 2099`                    | deadline is `startedAt + durationMinutes`                                      |
| Answer with a question id from another quiz     | `404`, or `422`                                                                |
| Read/write/submit another student's attempt     | `404 ATTEMPT_NOT_FOUND` (not `403` — the existence of the id is not confirmed) |
| Write after the deadline                        | `409 ATTEMPT_EXPIRED`                                                          |
| Submit after the deadline                       | graded, `autoSubmitted: true`, time clamped to the deadline                    |

The paper served while an attempt is live never contains `isCorrect`, the key, or an explanation;
those are released only by the review endpoint, and only after the attempt is finished.

---

## 6. API validation

Zod is the only way a handler receives input. Bodies, query strings and path parameters are all
parsed: a malformed UUID is a `422` before any query runs, an unknown field is stripped rather than
trusted, and a string where a number belongs is a `422` rather than a coercion.

| Input                            | Answer                                                     |
| -------------------------------- | ---------------------------------------------------------- |
| Malformed JSON                   | `400 INVALID_JSON`                                         |
| Missing/incorrect `Content-Type` | `400 INVALID_JSON`                                         |
| Failing schema                   | `422 VALIDATION_ERROR` + per-field issues, no stack frames |
| Unknown route                    | `404 NOT_FOUND`                                            |
| Body over 64 KB                  | `413 PAYLOAD_TOO_LARGE`                                    |

SQL injection is structurally impossible — every query is built by Drizzle with bound parameters — and
the suite proves the behaviour rather than the claim: `' OR 1=1 --` as an email is a `401`, and as a
directory search term it returns **zero** users.

---

## 7. Rate limiting

`apps/api/src/lib/rate-limit.ts` is a fixed-window counter keyed by a string, with the clock as a
parameter so tests can step across a window without sleeping.

| Guard                     | Key                     | Policy                | Behaviour when full                               |
| ------------------------- | ----------------------- | --------------------- | ------------------------------------------------- |
| Sign-in, per address      | `login:ip:<ip>`         | 10 per 5 min (env)    | **Hard** block: `429` before any hashing          |
| Sign-in, per account      | `login:account:<email>` | 5 failures per 15 min | **Soft** block: `429` only after a wrong password |
| Registration, per address | `register:ip:<ip>`      | 10 per hour (env)     | Hard block                                        |

The split matters. A hard account lockout is a denial-of-service gift — anyone who knows your email
could lock you out — so the account bucket is consulted _after_ the password is rejected. Guessing
stops earning answers; the owner's correct password still works and clears the counter.

Both successful and failed sign-ins are counted differently on purpose: only **failures** increment,
so a person signing in repeatedly is never throttled by their own success. `429` responses carry
`Retry-After` and a `RATE_LIMITED` code.

Memory is bounded at 10,000 buckets, expired ones are swept first; the trade-off is documented below.

---

## 8. Cross-site requests

The cookie is `SameSite=Lax`, which already blocks a browser from attaching it to a cross-site `POST`.
The same-origin guard is defence in depth for the cases `SameSite` cannot cover — an old browser, a
regression to `SameSite=None`, a future non-cookie scheme.

- Safe methods (`GET`, `HEAD`, `OPTIONS`) are never blocked.
- A request with **no** `Origin` is not a browser cross-site request (curl, the e2e run, a
  server-to-server call), so it is allowed.
- `POST /api/auth/logout` is exempt: refusing it would let a stale request keep a victim signed in.
- Everything else from a foreign origin is `403 CROSS_ORIGIN_BLOCKED`.

Allowed origins are the configured web origin, plus — only while `ENV_NODE` says this is a
development or demo surface — the `localhost:3000` aliases and the sandbox preview hosts
(`*.e2b.app`, `*.e2b.dev`, `*.arena.ai`, matched as whole suffixes, so `e2b.app.example.com` is not
one of ours). A production deployment trusts `WEB_ORIGIN` alone.

The policy is a pure function, `originAllowed(origin, { allowedOrigins, allowPreviewHosts })` in
`apps/api/src/lib/env.ts`, so both answers are provable in one test run rather than only on a
deployment. CORS uses the same predicate and simply omits the header for anyone else. See
[`runtime-modes.md`](runtime-modes.md).

---

## 9. Browser hardening

`apps/web/src/lib/security-headers.ts` is imported by `next.config.ts` **and** unit tested, so the
policy cannot drift without a failing test.

| Header                      | Value                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'`; scripts and styles `'self' 'unsafe-inline'`; `object-src 'none'`; `frame-src 'none'`; `base-uri`/`form-action` `'self'`; `frame-ancestors` = self + preview hosts |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                               |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                       |
| `Permissions-Policy`        | camera, microphone, geolocation, payment, usb all `()`                                                                                                                                  |
| `Strict-Transport-Security` | production only                                                                                                                                                                         |

Two deliberate choices:

- **No `X-Frame-Options`.** It cannot express "my own origin plus these preview hosts", and `DENY`
  would break the sandbox preview the app is reviewed in. `frame-ancestors` is the modern equivalent
  and is what browsers enforce.
- **`'unsafe-inline'` for scripts.** Next's bootstrap and RSC payload are inline. A nonce-based policy
  needs a middleware-generated nonce threaded through every render; that is the documented next step,
  not something to claim without doing.

The API sends its own set (`hono/secure-headers`), plus `Cache-Control: no-store` and `Vary: Cookie`
on every response — session data must not land in a shared cache or a proxy.

---

## 10. Known trade-offs

| Trade-off                                      | Why it is acceptable here                              | What production should do                                                        |
| ---------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Rate limits live in process memory             | Single Node process; a restart clears them             | Move `checkRateLimit`/`hitRateLimit` to Redis when running more than one replica |
| `X-Forwarded-For` is trusted for the client IP | The app is deployed behind one proxy that sets it      | Only trust the header from known proxy hops; strip it at the edge                |
| `'unsafe-inline'` in the CSP script-src        | Next requires it without a nonce pipeline              | Add the nonce middleware and drop it                                             |
| Sessions are stateless JWTs                    | No session table to read, and a 7-day TTL              | Add a jti denylist if instant revocation is required                             |
| Logout is exempt from the origin guard         | Clearing a cookie is not a state change worth blocking | Keep it                                                                          |
| The decoy hash equalises login timing          | Costs one scrypt per unknown email                     | Keep it; it is cheaper than enumeration                                          |

---

## 11. Verification

| Suite                                                                                | What it proves                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `security.test.ts` (51) + `origins.test.ts` (8)                                      | the nine areas above, plus rate limiting, the origin guard, the body cap, cache headers and the production origin policy |
| `auth.test.ts`, `auth-lib.test.ts`, `authorization.test.ts`                          | session lifecycle, guards, `SELF_LOCKOUT`, deactivation                                                                  |
| `admin-*.test.ts`, `student-*.test.ts`, `submissions.test.ts`, `leaderboard.test.ts` | the feature contracts those attacks probe                                                                                |
| `security-headers.test.ts` (8)                                                       | the CSP directives, the preview allowance, HSTS only in production                                                       |
| `test:e2e` (73)                                                                      | the real process: headers on the wire, a blocked foreign origin, a `413`, and a `429` with `Retry-After`                 |
