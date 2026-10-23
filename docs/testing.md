# Testing

Two layers, both runnable from the repo root:

```bash
bun run test       # 621 unit + integration tests across the four workspaces
bun run test:e2e   # 65 checks against a real HTTP server (own process, own port)
```

Neither touches Turso. Every suite builds a throwaway `file:` database in `.data/` with the project's
own toolchain (`drizzle-kit migrate`, then the seed script) and deletes it afterwards, so the SQL that
ships is the SQL that is verified. The Turso-only rule applies to the running application, not to
tests.

---

## What runs where

| Workspace      | Tests | Focus                                                                                      |
| -------------- | ----- | ------------------------------------------------------------------------------------------ |
| `@quiz/shared` | 182   | auth + content contracts, attempt clocks, the grader, review/history and dashboard helpers |
| `@quiz/db`     | 61    | migrations replayed from scratch, schema constraints, seed integrity, Drizzle Kit wiring   |
| `@quiz/api`    | 236   | health/readiness, auth, guards, content, taking, grading, reviewing, dashboard stats       |
| `@quiz/web`    | 142   | error envelopes, page guards, directory/quiz/student/review/dashboard helpers              |

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
64. logout → 200 with `Max-Age=0`
65. unknown route → 404 `NOT_FOUND`

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
