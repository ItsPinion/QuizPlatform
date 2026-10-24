# Testing

Two layers, both runnable from the repo root:

```bash
bun run test         # 998 unit + integration tests across the four workspaces
bun run test:e2e     # 77 checks against a real HTTP server (own process, own port)
bun run deploy:check # the deployment gate (see docs/deployment.md)
```

Neither touches Turso. Every suite builds a throwaway `file:` database in `.data/` with the project's
own toolchain (`drizzle-kit migrate`, then the seed script) and deletes it afterwards, so the SQL that
ships is the SQL that is verified. The Turso-only rule applies to the running application, not to
tests.

---

## What runs where

| Workspace      | Tests | Focus                                                                                                                                                                            |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@quiz/shared` | 338   | auth + content contracts, attempt clocks, the grader, dashboard, analytics, ranking, deployment rules, availability, passwords, certificates, email, CSV import, `.xlsx` reading |
| `@quiz/db`     | 62    | migrations replayed from scratch, schema constraints, seed integrity, Drizzle Kit wiring                                                                                         |
| `@quiz/api`    | 339   | health/readiness, auth, guards, content, taking, grading, reviewing, stats, analytics, board, system, account, import, outbox                                                    |
| `@quiz/web`    | 259   | error envelopes, page guards, directory/quiz/student/review/dashboard/analytics/rank helpers, theming                                                                            |

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
- **Category resolution** — the same typed name in a different casing reuses the existing row (a
  new-category test asserts the returned `categoryId` is the seeded id, not a fresh one); an unknown
  name is created and used within the same `POST`; internal whitespace is collapsed before the
  comparison, so `"Data   Engineering"` matches `"Data Engineering"`; `POST /api/admin/categories`
  is `201 created` then `200 created: false`; both forms in one body → 422; neither → 422; an unknown
  `categoryId` still → `422 CATEGORY_NOT_FOUND`; and `PATCH { categoryName }` moves a quiz to a
  brand-new category without touching anything else.
- **Contracts** — `slugify` (case, punctuation, accents, length cap), `uniqueSlug` (suffixes, `quiz`
  fallback, `Set` input), create defaults, update-without-defaults, list query defaults, the
  `canPublish` / `canDelete` helpers, `categoryNameSchema` (trim, 2–80 chars, whitespace collapse),
  `normalizeCategoryName` and `findCategoryByName` (case-insensitive, whitespace-insensitive).
- **Web helpers** — `rankCategories` puts an exact match first regardless of casing, ranks prefix
  matches above substring matches, drops non-matches, and honours the limit.

### Categories & questions coverage (Day 6)

- **Category CRUD** — the list with counts, detail with the quizzes filed under it, create with a
  derived slug, the idempotent re-create under a different casing, rename that keeps the slug,
  re-casing a category's own name, `409 CATEGORY_EXISTS` against a sibling, description set and
  clear, empty body → 422, 404 for unknown ids, and 401/403 for anonymous and student callers.
- **Category deletion** — an empty category deletes and then 404s; one with quizzes answers
  `409 CATEGORY_HAS_QUIZZES` and the row count is unchanged; the same delete succeeds once its
  quizzes are gone.
- **Question reads** — seeded questions come back in `0..n-1` order with exactly one correct option
  each; unknown quiz → 404; malformed id → 422.
- **Question creation** — appends at `max + 1`, stores marks/difficulty/explanation, defaults marks to
  1 and difficulty to `MEDIUM`, and rejects too few or too many options, an out-of-range correct
  index, duplicate options (case-insensitive), a blank option, short text and marks outside 1–10.
- **Question editing** — `PUT` replaces the text and the option set, keeps the ids of retained
  options, drops removed ones, re-points the correct answer, refuses to drop an option that appears
  in a recorded answer (`409 OPTION_HAS_ANSWERS`, with nothing written), and rejects an option id
  that belongs to another question (`422 OPTION_NOT_FOUND`).
- **Question deletion** — an unanswered question deletes and the remaining positions are compacted;
  a question with answers answers `409 QUESTION_HAS_ANSWERS` and stays; the last question of a
  published quiz answers `409 QUIZ_WOULD_HAVE_NO_QUESTIONS` until the quiz is unpublished.
- **Ordering** — a whole-list reorder persists and rewrites positions; a partial list or a foreign id
  answers `422 QUESTION_ORDER_MISMATCH`.
- **Publish integration** — a quiz with no questions is refused, adding a question makes the same
  publish succeed with `questionCount: 1`.
- **Contracts** — `questionInputSchema` (limits, duplicates, index bounds, defaults, option ids),
  `questionOrderSchema`, `canDeleteQuestion`, `canDeleteLastQuestion`, `totalMarks`,
  `updateCategorySchema` and `canDeleteCategory`.
- **Web helpers** — form ↔ payload round-trips, blank-row compaction that keeps the correct answer
  correct, validation messages, `moveItem`, `summarizeQuestions` and the difficulty tones.

### Student quiz coverage (Day 7)

- **Catalogue** — only published quizzes are returned (the draft and unpublished seeds are absent),
  aggregates agree with the tables, `attemptsRemaining` is derived from the student's own attempts,
  search/difficulty/category filters work, the title sort is stable, and a page size above the cap is
  a 422.
- **Visibility** — a draft and an unpublished quiz both answer `404 QUIZ_NOT_FOUND` to a student;
  a malformed id is 422; an admin gets 403 and an anonymous caller 401.
- **Starting** — a first start creates `IN_PROGRESS` with `expiresAt − startedAt` equal to the quiz
  duration and `totalMarks` snapshotted; a second start returns the _same_ attempt with
  `resumed: true` and the same deadline; a quiz whose attempts are used answers
  `409 ATTEMPTS_EXHAUSTED`; an admin cannot start anything.
- **The attempt payload** — questions arrive ordered with options in position order, `answers` starts
  empty, and the serialized body matches neither `isCorrect` nor `is_correct` nor `explanation`.
- **Ownership** — another student's attempt is `404` on read _and_ on write.
- **Saving answers** — save, replace and clear all round-trip through the session payload, with
  progress counts; an option from a different question is `422 OPTION_NOT_FOUND`, an unknown question
  `422 QUESTION_NOT_FOUND`, a malformed option id 422.
- **Locks** — a finished attempt answers `409 ATTEMPT_NOT_ACTIVE`; moving the deadline into the past
  makes the next read settle the attempt (Day 8's lazy expiry): the status leaves `IN_PROGRESS`,
  `expired` becomes `false` and `result` is populated, a write answers `409 ATTEMPT_NOT_ACTIVE`, and
  starting again opens a _new_ attempt rather than resuming the dead one.
- **Contracts** — `secondsRemaining` (rounding up, never negative, Dates and timestamps),
  `formatClock`, every `startDecision` branch (draft, empty, exhausted, resume-wins), progress
  counting that ignores stale answers, timer tones, `saveAnswerSchema` and the list-query defaults.

### Submission & scoring coverage (Day 8)

- **The grading matrix** (`@quiz/shared`) — correct / incorrect / unanswered counts, per-question
  marks adding up, a selection outside the question's own options counting as unanswered, unknown
  question ids ignored, duplicate rows letting the last one win, two-decimal rounding, the exact pass
  boundary, one point below it, and an empty paper never passing even with a 0 pass mark.
- **Timing** — `timeTakenSeconds` (whole seconds, rounding, never negative) and `wasAutoSubmitted`
  (false inside the window, true exactly at and after the deadline).
- **Wire shapes** — the result schema parses, rejects a status outside `PASSED`/`FAILED`, and the
  submit envelope round-trips.
- **End to end** (`@quiz/api`) — start → answer → submit returns full marks and `PASSED` with the
  attempt row updated and `is_correct` stamped on every answer.
- **Wrong and blank answers** — one wrong option, one saved-then-cleared answer and the rest
  untouched produce `incorrectAnswers: 1`, `unanswered: n − 1`, `0%`, `FAILED`, and the cleared row
  keeps `is_correct = null`.
- **Idempotency** — a second submit answers `alreadySubmitted: true` with the same percentage,
  `completedAt` and time taken, and the database row is unchanged.
- **Auto-submit** — with the deadline in the past, a write is `409 ATTEMPT_EXPIRED`, the submit
  succeeds with `autoSubmitted: true`, `completedAt === expiresAt` and `timeTakenSeconds` equal to the
  duration, and the next write answers `409 ATTEMPT_NOT_ACTIVE`.
- **Lazy expiry** — a stale attempt is still `IN_PROGRESS` until a catalogue read settles it; then
  `attemptsUsed` includes it, `inProgressAttemptId` is null, the session carries the result and
  `expired` is false.
- **No answer key** — neither the live session nor the graded session nor the submit response
  contains `isCorrect` or `explanation`.
- **Access** — another student's attempt is `404`, an unknown id `404`, an admin `403`, a malformed id
  `422`.
- **Presentation** (`@quiz/web`) — percentage formatting, the pass/fail headline and badge tone, the
  `8 of 10 marks` line, the auto-submit note appearing only when relevant, the time-taken clock and
  the one-sentence summary.

### Results & review coverage (Day 9)

- **Verdicts** (`@quiz/shared`) — correct / incorrect / unanswered split, "no key means no correct",
  marks earned only for correct answers, the tally adding up to the paper, filter matching, the
  review and history schemas (including a review that must carry `completedAt`), query defaults,
  coercion and caps, and every status label.
- **A full review over HTTP** — a hand-built paper with one right, one wrong and the rest blank
  returns the expected counts, exactly one correct option per question, the picked option flagged,
  and explanations from the seed.
- **The stored score agrees** — the per-question `earnedMarks` sum to `result.score`, and
  `counts.correct` equals `result.correctAnswers`.
- **The key stays hidden live** — reviewing a running attempt is `409 ATTEMPT_NOT_ACTIVE`, and the
  refusal body contains no `isCorrect`.
- **Ownership** — another student's review is `404`, an unknown attempt is `404`, an admin gets
  `403`, a malformed id is `422`.
- **History** — only the caller's rows, newest first, `inProgress`/`passed` flags consistent with the
  status, totals agreeing with the database, status and quiz filters, score sorting, pagination with
  correct `hasNext`/`hasPrev`, and the sweep settling a timed-out attempt before it is listed (which
  then becomes reviewable).
- **History validation** — `page=0`, `pageSize=51`, `sort=random`, `status=EXPIRED`, `quizId=nope`
  all `422`; admin `403`; anonymous `401`.
- **The view helpers** (`@quiz/web`) — review and history filter parsing, href round-trips that never
  emit a value the parser would drop, verdict labels and badge tones, question numbering and marks
  copy, the "what you picked" sentence, filter options with counts, and the timestamp formatter.

### Student dashboard coverage (Day 10)

- **The six statistics** (`@quiz/api`) — totals are compared against hand-inserted graded and
  in-progress rows, so `attempts`, `passed`, `failed`, `inProgress`, `averagePercentage`,
  `bestPercentage`, `questionsAnswered` and `quizzesAttempted` are checked as arithmetic rather than
  "looks plausible".
- **Ranges and nulls** — every percentage lands in 0–100, `passRate` agrees with `passed/(passed+failed)`,
  and a student with no attempts gets zeroes for counts with `null` averages (never `0%`).
- **The charts' data** — the trend is chronological, capped at twelve, and agrees with the stored
  scores; the activity window is exactly fourteen buckets ending today, zero-filled; category attempts
  sum to `passed + failed` and the rows are alphabetical.
- **Recent attempts** — newest first, at most five, and a submission made inside the test appears on
  the very next call.
- **Live attempts move nothing** — an `IN_PROGRESS` row is counted in `attempts` but excluded from
  every average, rate and accuracy, and a timed-out attempt is settled (with `autoSubmitted`) before
  the numbers are read.
- **Access** — scoping between two seeded students, `403` for an admin, `401` anonymously.
- **The helpers** (`@quiz/shared`) — `averageOf`, `passRateOf`, `streakOf` edges (empty list, a
  break in the streak, best run), duration formatting, UTC day keys, `activityBuckets` zero-filling,
  `scoreChartPoints/Path/Area` (single point, flat line, clamping at 0–100) and the schema bounds.
- **Presentation** (`@quiz/web`) — percent and coverage labels, `—` for a missing value, streak and
  activity captions, trend deltas and their wording, and bar widths for empty and single-category
  payloads.
- **Health probe** — `/api/health/db` now compares its counts against a direct query rather than a
  frozen snapshot, because the fixture database is shared by parallel test files.

### Admin analytics coverage (Day 11)

- **Every aggregate against the database** — students, active students, learners, quizzes,
  published/draft/unpublished quiz counts, and attempts by status are compared with direct queries,
  so "the number on the card" and "the rows in the table" cannot drift apart.
- **Buckets add up** — `passed + failed + expired + inProgress = total`, `graded = passed + failed`,
  `attempted + neverAttempted = quizzes`, and every rate is inside 0–100.
- **The timeline** — exactly `days` buckets, chronological, ending today, labelled `15 Mar`, and its
  attempts sum to `attempts.inWindow`.
- **The windows** — 7, 14, 30 and 90 each answer with the right length; `days=365` is `422`;
  `days=` (empty) means the default; `inPreviousWindow` counts the adjacent window, not this one.
- **Popularity** — quiz rows sum to the total attempts and are ordered by attempts desc, with a pass
  rate, a parseable `lastAttemptAt` and a category; category rows cover every category (quiet ones
  with `null` averages) and their `quizzes` counts match the quizzes table.
- **Live data** — a new graded attempt moves totals, today's bucket and the quiz row on the next call;
  an `IN_PROGRESS` row moves no average or pass rate; a timed-out paper is swept (status becomes
  PASSED/FAILED) and counted as graded rather than lingering in progress.
- **Registrations** — a new student lands in today's bucket and in `newInWindow`.
- **Access** — `401` anonymously, `403` for a student.
- **The helpers** (`@quiz/shared`) — window parsing, zero-filled buckets and their labels, window
  totals and the busiest day, ratio slices (expired separate, percentages summing to 100), share and
  bar scaling, series points for a flat/empty/single-value series, percent change, and both schemas.
- **Presentation** (`@quiz/web`) — window parsing and href round-trips, change wording and tones,
  outcome labels and tones, popularity captions (singular included), clamped score bars, pass-rate
  captions and the timeline's screen-reader summary.

### Leaderboard coverage (Day 12)

- **Against the database** — every entry's average, best score, attempts, quizzes completed, passed,
  failed and pass rate is compared with that student's own graded rows, so the board cannot drift
  from the attempts table; the payload is also asserted to contain no email address.
- **Ordering and ranges** — the board is sorted by the chosen metric (and its tie-breakers), ranks
  never run backwards, every percentage and rate is within range, and `passed + failed = attempts`.
- **Ties** — a controlled fixture (one throwaway category and quiz, two new students sitting it at
  88%) yields ranks `1, 2` shared and `3` for the next student, with an 18-point gap, proving the
  competition rule rather than just "no equal neighbours".
- **The metrics** — `best` and `completed` each re-sort the board, and their values agree with the
  underlying attempts.
- **The periods** — a freshly graded attempt appears in `week` and `month`; an attempt dated outside
  the window contributes to `all` only, so the rolling boundary is exercised on both sides.
- **Scopes and refusals** — a category board equals the per-category aggregates and echoes
  `scope.categoryName`; an unknown `categoryId` is `404 CATEGORY_NOT_FOUND`; `?metric=streak`,
  `?period=year`, `?limit=0|51` and a malformed `categoryId` are `422`.
- **The caller** — `currentUser` is returned with `isCurrentUser: true` and a rank consistent with
  the visible slice, `401` anonymously for both roles allowed.
- **The category filter** — `categories[]` is compared row-for-row against the `categories` table
  (same ids, nothing invented, nothing omitted), ordered by name, with each count matching a direct
  tally of graded attempts; a category inserted mid-test appears with `attempts: 0` on the next
  request, which is what makes a runtime-added category work without a deploy.
- **The helpers** (`@quiz/shared`) — metric values, sorting per metric with tie-breakers, competition
  ranks and gaps in percentage points _and_ quizzes, `buildLeaderboard` (current-user marking, pass
  rates, an empty board), rolling period starts, `topPercentOf` and the query/payload schemas.
- **Presentation** (`@quiz/web`) — filter parsing with fallbacks, query building, href round-trips
  that preserve the other controls, metric/period/scope labels, ordinals (`11th`, `21st`), rank tones,
  gap wording (`Tied`, `5 pts behind`, `1 quiz behind`), the current-user caption and the board's
  screen-reader summary.

### Security coverage (Day 13)

Fifty-one tests in `apps/api/src/__tests__/security.test.ts`, grouped exactly as the spec lists the
areas. Every one assumes a hostile caller; none of them re-asserts a happy path another file covers.

- **Authentication** — no plaintext password is stored or returned (the record matches the scrypt
  format), an unknown email answers byte-identically to a wrong password, a token minted for another
  `aud` or by another `iss` is refused even with the right secret, `alg: none` is refused, and the
  session cookie carries `HttpOnly`/`SameSite=Lax`/`Path=/` on a `no-store` response.
- **Authorization** — every admin read is `403` for a student and every student read `403` for an
  admin (parametrised, one case per endpoint); a token signed by us that claims `ADMIN` for a
  `STUDENT` row still gets `403` because the stored role decides; writes are guarded too; and a
  registration asking for `role: ADMIN` is stored as `STUDENT`.
- **Quiz creation** — `status`, `id`, `slug`, `attemptCount` and `createdAt` sent by a client are all
  ignored; five malformed payloads are `422`; an XSS title is stored and returned verbatim as data.
- **Quiz attempts** — another student's paper is `404` for read, write, submit and review; a draft
  cannot be started; a second start resumes the same row (one attempt in the table, `resumed: true`);
  an answer pointing at another quiz's question is refused; the live paper contains no answer key.
- **Timer** — a client-supplied `expiresAt`/`startedAt`/`durationMinutes` is ignored and the deadline
  is exactly `startedAt + duration`; a write past the deadline is `409 ATTEMPT_EXPIRED`; a late submit
  is graded as auto-submitted with its duration clamped.
- **Score calculation** — a submitted `score: 999`/`percentage: 100`/`status: PASSED` is ignored and
  the paper is graded at zero; a one-of-two paper scores 1/2 = 50% and the stored result agrees with
  the marks.
- **API validation** — malformed JSON `400`, wrong content type `400`, unknown route `404`, a 422
  envelope with per-field issues and no stack frames, malformed UUIDs `422` before any query, and a
  200 KB body `413`.
- **Unauthorized access** — thirteen protected endpoints answer `401` without a session; a write from
  `https://evil.example` is `403 CROSS_ORIGIN_BLOCKED` while the app origin and a preview host pass;
  reads are unaffected and get no CORS grant; every response is `no-store` with `Vary: Cookie`.
- **Input validation** — `' OR 1=1 --` as an email is `401` and as a directory search returns zero
  users; an `<img onerror>` category name round-trips as data and is deleted again; the password
  policy rejects five shapes; a wrongly-typed field is `422` rather than coerced.
- **Rate limiting** (new control) — bucket arithmetic across a window boundary with an injected clock,
  per-key isolation, a hard per-address block with `Retry-After` (and another address unaffected), a
  soft per-account block that still lets the owner in, registration capped, and successes never
  counted against the limit.
- **Headers** (`@quiz/web`, 8) — the CSP directives themselves: `default-src 'self'`, no remote hosts
  in any script/style/connect/img/font source, no `'unsafe-eval'` in production, `frame-ancestors`
  limited to self plus the preview hosts, HSTS only in production, and the deliberate absence of
  `X-Frame-Options`.

### Deployment coverage (Day 14)

The deployment gate is a pure function, so it is tested as one — no process, no database, no HTTP.
`packages/shared/src/deployment.test.ts` has **22** cases; the API and the page add **7** and **15**.

- **Every verdict path** — all eight checks passing → `ready`; a single warning → `attention`; a single
  failure → `blocked` (a warning never outranks a failure).
- **The environment rules, one test each** — a missing database URL fails; a `file:` URL fails in
  production and warns in development; a remote URL with an empty token fails; the token check is
  skipped for `file:`; a missing `JWT_SECRET` fails in production and warns locally; a secret under 32
  characters fails only in production; a malformed `WEB_ORIGIN` or `API_INTERNAL_URL` fails; plain
  `http` in production warns; `NODE_ENV` other than `production` warns (`test` skips); a disabled rate
  limit and an out-of-range body cap warn while their defaults pass.
- **The contract** — the id order is fixed (`database-url` … `body-limit`), every result carries a
  label, a detail and a nullable hint, `summarizeChecks` counts per status, and `summaryLabel` reads
  `8 of 8 checks pass` / `7 of 8 checks pass · 1 warning`.
- **The system report** (`@quiz/api`, 7) — `/api/admin/system` returns the schema-validated document,
  its counts equal the five table counts, the checks are honest about a `file:` database (verdict
  `attention` in a test process), no token/secret/hash appears anywhere in the serialised body, the
  reported limits equal the enforced ones, students get `403` and anonymous callers `401`, and the
  response is `no-store`.
- **The presentation helpers** (`@quiz/web`, 15) — verdict and status labels/tones, `runtimeLabel`
  across minutes/hours/days, `latencyLabel` with `null`, `countsLabel` singular/plural and its
  no-counts fallback, `actionableChecks` ordering (warnings and failures only), and `hostLabel`
  for a full URL, a bare host and `null`.

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
25. `POST /api/admin/categories` with an existing name in SHOUTING case → 200 `created: false`, same
    id, and the category count does not move
26. create a quiz with `categoryName` (lowercased) → 201, resolved to that category's id, then deleted
27. `/api/admin/quizzes` → 200 with joined aggregates
28. create a quiz → 201, `DRAFT`, slug derived from the title
29. `PATCH` it → 200, title and duration updated, slug unchanged
30. publish it → 409 `QUIZ_HAS_NO_QUESTIONS`
31. a seeded draft publishes and then unpublishes
32. deleting an attempted quiz → 409 `QUIZ_HAS_ATTEMPTS`
33. deleting the created quiz → 200, then `GET` → 404
34. `POST /api/admin/categories` → 201, then `PATCH` renames it → 200 with the same slug
35. deleting a category that still has quizzes → 409 `CATEGORY_HAS_QUIZZES`
36. deleting an empty category → 200, then `GET` → 404
37. `POST /api/admin/quizzes/:id/questions` → 201 at position 0, 4 options, one correct
38. a question with a single option → 422 `VALIDATION_ERROR`
39. `PATCH …/questions/order` → 200, the order flips and positions are `0,1`
40. `PUT /api/admin/questions/:id` → 200, 4 → 2 options, the retained option keeps its id
41. publishing the quiz now → 200 `PUBLISHED` with `questionCount: 2`
42. deleting both questions → first 200, then 409 `QUIZ_WOULD_HAVE_NO_QUESTIONS`; unpublish → 200
43. the authored quiz is deleted again → 200
44. quiz management, category creation and question routes → 403 for the student
45. `/api/student/quizzes` → 200, every seeded published quiz, no drafts
46. a hidden (draft or unpublished) quiz → `404 QUIZ_NOT_FOUND` for the student
47. start an attempt → 201 `resumed: false`; starting again → 201 `resumed: true`, same id
48. the attempt payload contains no `isCorrect` / `explanation` and starts with no answers
49. saving an answer → 200 with progress, and it round-trips through the session
50. another student reading/writing that attempt → 404
51. student routes → 403 for the admin
52. submit the attempt → 200, the counts add up to the paper, percentage in range, `status` agrees
    with `passed`, `completedAt` set, no `isCorrect` in the body
53. submitting again → 200 `alreadySubmitted: true` with the same percentage and `completedAt`
54. the graded attempt reports its result, `expired: false`, a further write → 409 `ATTEMPT_NOT_ACTIVE`
55. the catalogue reflects it → no `inProgressAttemptId`, `bestPercentage` equals the stored score
56. another student submitting that attempt → 404 `ATTEMPT_NOT_FOUND`
57. the answer review → 200, whole paper, verdicts that add up and agree with the stored score, one
    correct option per question, explanations present
58. reviewing a live attempt → 409 `ATTEMPT_NOT_ACTIVE` with no `isCorrect` in the body
59. the attempt history → 200 with the graded paper, `inProgress: false`, the same percentage, and
    lifetime totals
60. filtering the history by `status=PASSED` → 200 with only passed rows
61. another student reading that review → 404 `ATTEMPT_NOT_FOUND`
62. `GET /api/student/dashboard` → 200, the six statistics with their invariants (counts add up, every
    range holds, the trend is chronological, fourteen activity buckets, the graded attempt in
    `recent`)
63. the dashboard is scoped and guarded → 401 anonymously, 403 for the admin, no overlap between two
    students' recent attempts
64. `GET /api/admin/analytics?days=7` → 200, seven chronological buckets ending today, status buckets
    adding up, the timeline total matching `inWindow`, and quiz/category rows summing to the attempts
65. the window is validated and guarded → `422` for `days=365`, `403` for the student, `401`
    anonymously, and `days=90` returns ninety buckets
66. `GET /api/leaderboard` → 200, default metric/period/overall scope, entries sorted with monotonic
    ranks, `passed + failed = attempts`, `best ≥ average`, participants matching the row count, the
    caller present, and no email anywhere in the body
67. the leaderboard's controls → `metric=completed&period=week` sorted by quizzes, the category scope
    echoing its name, `422` for `?metric=streak`, `404` for an unknown category, `401` anonymously
68. hardening headers on the wire → `nosniff`, frame and referrer policies, a request id,
    `Cache-Control: no-store` and `Vary: Cookie`
69. a write from a foreign origin → 403 `CROSS_ORIGIN_BLOCKED`, while the app's own origin → 200
70. a 200 KB body → 413 `PAYLOAD_TOO_LARGE`, refused before it is parsed
71. ten bad passwords from one address → `429 RATE_LIMITED` with `Retry-After`, and the same
    credentials from another address still → 200
72. logout → 200 with `Max-Age=0`
73. unknown route → 404 `NOT_FOUND`
74. `GET /api/admin/system` → 200, a valid verdict, eight checks, a connected database with counts,
    trusted origins reported, `no-store`, and none of `authToken`/`jwtSecret`/`passwordHash` anywhere
    in the raw body
75. the same endpoint for a student → `403`, and anonymously → `401`

The numbering above follows the flow a reader cares about; the script runs 77 checks in total,
including the appearance and availability assertions that grew out of §26.

It prints a pass/fail table, exits non-zero on failure, and removes the database afterwards.

One consequence of scheduling worth knowing when reading the script: it chooses a quiz whose
`availability` is `OPEN` before it starts an attempt. The seed includes a paper scheduled for later
in the week, so "the first quiz in the catalogue" is no longer the same thing as "a quiz you can
sit" — and a test that assumed otherwise would fail for the right reason on the wrong day.

---

## Specification audit

`bun run test:spec` (source: `scripts/spec-audit.ts`) reads the specification back to the running product. Every probe is
tagged with the section it comes from (`§4`, `§6`, `§26`, …), so the output can be read beside the
document rather than interpreted. It is deliberately _outside_ the test runner: no imports from the
repo, no fixtures, no mocks — it talks to a deployed API and rendered HTML with `urllib`, which is
the only way to notice that the tests and the product disagree.

It needs both servers up and a seeded local database:

```bash
# terminal 1 — API against a disposable file database
cd packages/db
TURSO_DATABASE_URL="file:../../.data/smoke.db" bunx drizzle-kit push --force
bunx tsx src/seed.ts --force
cd ../..
TURSO_DATABASE_URL="file:../../.data/smoke.db" JWT_SECRET=dev-secret-dev-secret-dev-secret-1234 \
  bun run --filter=@quiz/api start

# terminal 2 — the web app, pointed at that API
API_INTERNAL_URL=http://localhost:3001 bun run --filter=@quiz/web build
API_INTERNAL_URL=http://localhost:3001 bun run --filter=@quiz/web start

# terminal 3 — the audit
bun run test:spec
```

`API_URL`, `WEB_URL` and `SMOKE_DB` override the defaults (`localhost:3001`, `localhost:3000`,
`.data/smoke.db`); it runs on Bun with `fetch` and `bun:sqlite`, no extra dependency. §20 is the one section read from storage rather than HTTP — whether a documented
column exists is not observable through the API — and it skips itself when the file is absent.

The run mutates a little, on purpose and repeatably: it registers one throwaway student per run (the
attempt section plays the paper as that account, so a second run cannot fail for the boring reason
that the seeded student ran out of tries), creates and then deletes an audit quiz and category, sends
one password-reset mail, and spends its own rate-limit bucket from a fixed `X-Forwarded-For` address.

**Result on 2026-10-24, against `5c6e6c7` + the average-score fix: `191 passed · 0 failed`.** The
probes group by section as follows; each line is a count of assertions, not of features.

| §     | What the probes prove                                                                                                                                                                                                                                                                           | Probes |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 3.1   | both roles sign in; the admin console renders; users, quizzes, categories, attempts and one attempt's answers are readable through the API                                                                                                                                                      | 10     |
| 4     | register, logout, forgot-password for a student **and** an admin, a bad reset token refused, change-password requires the current password                                                                                                                                                      | 8      |
| 5     | every statistic the dashboard names — students, quizzes, published, drafts, questions, attempts, average, passed, failed — plus a 30-point timeline, popular quizzes and popular categories                                                                                                     | 15     |
| 6     | name, email, registration date, status, attempts, **average score**, highest score; a student's profile, history and performance; the profile page renders                                                                                                                                      | 13     |
| 7, 9  | create → edit → publish → unpublish → delete; every create-quiz field including the thumbnail; question text, options, one correct answer, explanation, marks, difficulty                                                                                                                       | 18     |
| 8     | create, rename, delete a category; the row links to the filtered quiz list                                                                                                                                                                                                                      | 4      |
| 11–14 | start, resume without spending a try, the server-side clock, answer save, submit, the full result payload, and a review carrying question, selected answer, correct answer, explanation and verdict                                                                                             | 26     |
| 15–19 | dashboard totals and recents; search by title and by category; category, difficulty, duration and sort filters; details; history; leaderboard across three metrics, three periods and one category                                                                                              | 31     |
| 20    | every table and column the spec draws exists, and passwords are stored as scrypt hashes                                                                                                                                                                                                         | 8      |
| 25    | the endpoint list resolves — each canonical route answers rather than 404s                                                                                                                                                                                                                      | 11     |
| 26    | randomisation, negative marking (setting **and** applied penalty), max attempts, scheduling (a blocked start), certificates plus public verification, the email outbox and its transport, dark mode on both consoles, CSV parse and commit                                                      | 20     |
| 27    | a tampered session, invalid ids, missing parameters, SQL injection, a foreign origin, rate limiting, secure headers, a CSP on the web app, an error envelope with no stack, unknown routes, no secrets in `/api/health`, stored-XSS escaping, and no answer key or score in the attempt payload | 23     |
| 28    | every console and the landing page declares a responsive viewport                                                                                                                                                                                                                               | 4      |

Two things the audit cannot prove, both documented elsewhere: question types other than
multiple-choice (§10 of the spec defers them; the rationale and migration path are in
`docs/advanced-features.md` §10), and wall-clock behaviour under load. Both remain honest gaps rather
than silent ones.

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
- [ ] In the create form, type `java` into **Category** → suggestions appear with quiz counts; pick
      `JavaScript` and the hint says _Existing category_.
- [ ] Type a name nobody has used, e.g. `Rust 2026` → the hint says _will be created_; save, reopen the
      create form and type `rust 2026` → it now suggests that category instead of offering to create it.
- [ ] Wide spacing (`Data   Engineering`) resolves to the existing `Data Engineering` rather than
      making a duplicate, and `/admin/categories` (via `curl`) still lists one row per name.
- [ ] `/admin/categories` lists all ten seeded categories with quiz counts; renaming one keeps its
      slug, and renaming it to another category's name is refused with a readable message.
- [ ] Delete is disabled on a category that has quizzes; on an empty one it asks for confirmation,
      then the row disappears.
- [ ] On a quiz's edit page, **Add question** with four options and one radio selected → the question
      appears at the end with its correct option highlighted and the explanation underneath.
- [ ] Edit that question, drop one option → the saved question has one fewer option and still exactly
      one correct answer; the retained options keep working.
- [ ] Try to delete a question marked "n recorded answers" → the button is disabled; `curl` the same
      `DELETE` and get `409 QUESTION_HAS_ANSWERS`.
- [ ] Publish a quiz with one question, then try to delete that question → `409
QUIZ_WOULD_HAVE_NO_QUESTIONS`; unpublish and the delete goes through.
- [ ] Use ↑ / ↓ on a question → the numbering updates and survives a reload.
- [ ] Sign in as `rahul@quiz.dev`, open `/student/quizzes` → only published quizzes; the draft and
      unpublished seeds are absent even if you paste their ids.
- [ ] Open a quiz → the rules (questions, marks, duration, pass mark, attempts left) are stated
      before the start button.
- [ ] Start it → the attempt opens on question 1 with a live countdown; selecting an option shows
      "saved", and reloading the page keeps the selection and the remaining time.
- [ ] Navigate with Previous/Next and the number grid → answered and unanswered questions are
      distinguishable.
- [ ] Start the same quiz again from the catalogue → it resumes the same attempt, and the attempt
      count does not move.
- [ ] Try to open `/student/attempt/<another student's id>` → 404.
- [ ] Use up every attempt on a quiz → the detail page reads "No attempts left" and the API answers
      `409 ATTEMPTS_EXHAUSTED`.
- [ ] Answer some (not all) questions, press **Submit quiz** → the confirm names how many are still
      blank; **Keep working** returns to the paper, **Submit now** shows the result card.
- [ ] The result card shows the percentage, `score of total marks`, the pass mark, correct /
      incorrect / unanswered counts and the time taken; the API's `attemptsUsed` and `bestPercentage`
      agree with it.
- [ ] Reload the result page → the same numbers come back from the server (nothing is recomputed in
      the browser), and the attempt is not resumable from the catalogue.
- [ ] Submit twice with `curl` → the second call answers `200` with `alreadySubmitted: true` and the
      same `completedAt`.
- [ ] Writes after grading → `409 ATTEMPT_NOT_ACTIVE`, with `curl`.
- [ ] Leave an attempt open, then move its `expires_at` into the past in the database → reload the
      attempt: it comes back graded, `expired` is false, and the result notes that the time ran out.
- [ ] Let the countdown reach `00:00` on a short quiz → the options lock, the banner says the attempt
      is being submitted, and the result card appears without a click.
- [ ] Block the network (DevTools → Offline) right before `00:00` → the alert keeps a **Retry**
      action, and retrying after going back online shows the result.
- [ ] Finished an attempt? The result card now has **Review answers** → every question with your
      pick, the correct one, and the explanation.
- [ ] On the review screen, the filter chips count down as expected; picking **Incorrect** shows
      only the misses and keeps their original numbering; a filtered view survives a reload because
      the filter is in the URL.
- [ ] Open a review of an attempt that is still running (paste the id of a live attempt) → the page
      says the attempt is still running, and `curl` the same URL for `409 ATTEMPT_NOT_ACTIVE`.
- [ ] `/student/results` lists your attempts newest first; the **Passed** / **Failed** /
      **In progress** chips narrow the list without losing the sort, and the totals stay the same
      because they cover the whole history.
- [ ] Sort by **Best score** → the percentages descend; a running attempt links to **Resume**, a
      finished one to **Review** and **Score**.
- [ ] Page through the history → the ends disable, and the page number is in the URL.
- [ ] `/student` now opens the dashboard: eight stat cards, and every caption has a denominator
      (`of 8 published`, `75% pass rate`). Compare the numbers with `/api/student/dashboard`.
- [ ] With no attempts at all (a fresh account), the averages read `—`, not `0%`, and the charts
      show their empty state instead of a flat failing line.
- [ ] Submit a quiz, go back to `/student` → the new attempt appears under **Recent attempts** and
      the trend, category bars and today's activity bar all move.
- [ ] Leave an attempt running and open `/student` → the resume banner is at the top, the counts show
      one in progress, and none of the averages include it.
- [ ] Click a category bar → it opens `/student/quizzes?categoryId=…` with only that category's
      quizzes; the filter survives a reload.
- [ ] Past a quiz's deadline, reload `/student` → the row is no longer "in progress" (the expiry
      sweep settled it) and the averages include it.
- [ ] `/admin/analytics` opens from the console sidebar (no longer a disabled "Day 11" item) and
      shows six stat cards plus four charts.
- [ ] Switch the window with the `7d` / `14d` / `30d` / `90d` chips → the URL carries `?days=`, the
      bars resize, and a reload reproduces the view. Try `?days=365` → it falls back to 30 days.
- [ ] Compare the cards with `/api/admin/analytics?days=30` → same numbers; the pass/fail legend's
      counts match `passed` / `failed` / `expired`.
- [ ] Hover a bar in **Attempts over time** → the tooltip names the day, the attempts, the
      registrations and that day's average.
- [ ] Submit a quiz in another tab, then reload `/admin/analytics` → today's bar, the quiz row and the
      averages all move.
- [ ] Sign in as a student and open `/admin/analytics` → redirected; `curl` the endpoint with the
      student cookie → `403`.
- [ ] `/student/leaderboard` opens from the student nav: the podium, your position card and the
      ranked table all render.
- [ ] Switch **Best** and **Completed** → the order changes and the metric column follows the chip;
      a reload keeps the choice in the URL.
- [ ] Switch **This week** → only recently graded papers count and the participant count drops (or the
      board empties with its empty state). Compare with `/api/leaderboard?period=week`.
- [ ] Pick a category → the header, the table title and the API scope all name it; **All categories**
      restores the overall board.
- [ ] Check the tie rule: two equal values share a rank and the next row skips a number; the gap column
      reads `Tied` for the pair and `—` for the leader.
- [ ] Open the board as a student with no graded attempt → the card invites a quiz instead of printing
      a rank, and they are absent from the table.
- [ ] Type a wrong password ten times → the eleventh attempt answers “Too many attempts” with
      `Retry-After` (network tab), and signing in from another address still works.
- [ ] Check the response headers of any page: `Content-Security-Policy` is present, `X-Frame-Options`
      is not, and the page still renders and hydrates with no console violation.
- [ ] `curl -X POST` with `-H 'Origin: https://evil.example'` → `403 CROSS_ORIGIN_BLOCKED`; repeat with
      `-H 'Origin: http://localhost:3000'` → the normal answer.
- [ ] Post a 200 KB JSON body → `413`; confirm the API stays up for the next request.
- [ ] Sign out and reuse the old cookie via `curl` → the session no longer resolves to a user.
- [ ] In the admin console, create a new category, then reload `/student/leaderboard` → the new name is
      in the filter row immediately (dimmed, `attempts: 0`), with no rebuild and no code change.
- [ ] `bun run deploy:check` on a production-shaped environment → `8 passed · 0 failures`, exit `0`;
      on a bare checkout → `blocked` with "TURSO_DATABASE_URL is not set", exit `1`.
- [ ] `NODE_ENV=production` with no `JWT_SECRET` → the API refuses to boot and the gate says `blocked`.
- [ ] `/admin/system` opens from the console sidebar: the verdict banner matches the CLI, the database
      card names Turso, the counts match `/api/health/db`, and no token or secret is on the page.
- [ ] Stop the database (or point at a bad token) and reload `/admin/system` → the page still renders,
      with `connected: false` and no counts, instead of a 500.
- [ ] `bun run deploy:check --url <host>` against a running production build → all eight probes pass.
      With `--admin <email>:<wrong-password>` the self-report probe fails while the other seven still
      pass — each probe is independent.
- [ ] Point `--url` at a stopped web app → the web probes fail, the API probes still pass, and the
      command exits `1` rather than throwing.
- [ ] Check the response headers of a deployed page: `Content-Security-Policy` is present,
      `Strict-Transport-Security` is present on the https build, and the console shows no violation.
- [ ] Two API instances behind a load balancer: the rate limit is per instance (documented), the
      session works on both, and `/api/admin/system` on each reports its own uptime.

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
- CSRF: the cookie is `SameSite=Lax`, every state-changing request needs a JSON body, and
  `apps/api/src/middleware/origin.ts` refuses any write carrying a foreign `Origin`
  (`403 CROSS_ORIGIN_BLOCKED`). Safe methods and requests without an `Origin` (curl, the e2e suite)
  pass, and logout is exempt so a stale cross-site request cannot pin a victim's session open.
- `JWT_SECRET` is mandatory in production (the API exits at boot without a 32+ character secret);
  local development falls back to a warned-about secret so `bun dev` works out of the box.
