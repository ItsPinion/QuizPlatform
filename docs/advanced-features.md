# Advanced features (§26) and the endpoint map (§25)

This is the manual for everything the brief calls "advanced": randomisation,
negative marking, attempt limits, scheduling, certificates, email, the appearance
toggle and bulk import. It also contains the one page most likely to be needed
during an integration review — a table that maps every endpoint the original
specification lists (§25) to the route this build actually serves, and says where
the two differ.

Each section ends with the tests that guard it, because a feature that is not
tested is a feature that will be quietly removed by the next refactor.

---

## 1. Question randomisation

`quizzes.shuffle_questions` and `quizzes.shuffle_options` are set per quiz in the
admin form (`/admin/quizzes/new`, `/admin/quizzes/:id`).

The shuffle happens **once, when the attempt starts**, not on every render:

- `attempts.question_order` and `attempts.option_order` store the dealt order as
  JSON (`question_order` is a list of question ids, `option_order` a map from
  question id to a list of option ids).
- Every subsequent read — the attempt screen, the resume, the review, the admin
  view — replays those arrays. A refresh cannot reshuffle a paper you are halfway
  through, and two tabs cannot show different orders.
- If a quiz has shuffling off, the columns stay `null` and the natural order is
  used. There is no "shuffle with seed 0" case to reason about.

Question _and_ option order are independent flags: a quiz can shuffle questions
and keep the options in the authored order, which matters for questions whose
options read as a scale.

**In the UI:** the student catalogue card shows a `Shuffled` badge, the quiz
detail page explains it in the rules, and the admin meta line for a quiz says
`questions/options shuffled`.

**Tests:** `packages/shared/src/attempt.test.ts` (order helpers),
`apps/api/src/__tests__/student-quizzes.test.ts` (the dealt order is persisted
and replayed), plus the live smoke run, which observed positions
`[0,3,2,5,4,1]` for `javascript-fundamentals` with stable option orders across
re-reads.

---

## 2. Negative marking

Score for one attempt:

```
penalty = round(negativeMarks × incorrectAnswers, 2)
score   = round(max(0, earned − penalty), 2)
```

Three decisions are load-bearing:

1. **Unanswered is never penalised.** Only a _wrong_ answer costs marks. A skipped
   question is worth zero, exactly as §26 asks ("skipped 0"). This is also what
   makes the auto-submit fair: a dropped connection cannot cost extra.
2. **The attempt's frozen `negativeMarks` wins.** The value is copied onto the
   attempt row at start, so editing the quiz afterwards cannot retroactively
   change a grade that was already awarded. Historical results stay true.
3. **The floor is zero.** A paper answered entirely wrong scores `0`, not a
   negative number — a leaderboard with negative rows is not a leaderboard.

Worked example from the smoke run (`javascript-fundamentals`, marks 2, penalty
0.25): one right, five wrong → `earned 2`, `penalty 1.25`, `score 0.75`,
`totalMarks 7`, `10.71%`, `FAILED`. Same paper answered `4/5` correctly on
`html-fundamentals` → `80%`, `PASSED`, certificate `QP-DETW-PVDS`.

The number is surfaced to the student rather than hidden: the result screen says
"N marks deducted: K wrong at X each", and the question review marks the wrong
ones with the deduction. The quiz detail page shows the rule _before_ the attempt
starts.

**Tests:** `packages/shared/src/submission.test.ts` (the formula, the rounding,
the zero floor, the frozen value, unanswered never penalised),
`apps/api/src/__tests__/submissions.test.ts` (end to end through the route).

---

## 3. Maximum attempts

`quizzes.max_attempts` (null = unlimited). `startDecision` in
`packages/shared/src/availability.ts` answers in a fixed order, and the order is
the design:

```
QUIZ_NOT_PUBLISHED → QUIZ_HAS_NO_QUESTIONS → in-progress → QUIZ_NOT_OPEN_YET
  → QUIZ_CLOSED → ATTEMPTS_EXHAUSTED → start
```

An attempt already in progress outranks the limit: a student who is on their last
allowed attempt must be able to finish it, even though starting a _new_ one would
be refused. The catalogue shows `No attempts left` and the button is disabled —
but never for a paper that is already open on their screen.

**Tests:** `packages/shared/src/availability.test.ts` (the precedence table),
`apps/api/src/__tests__/student-quizzes.test.ts`.

---

## 4. Scheduling

`quizzes.available_from` / `quizzes.available_until`, both nullable. The window
is **start-inclusive, end-exclusive** (`[from, until)`), which is what "available
until the 3rd" means to a human setting it.

`availabilityOf(quiz, now)` returns `{ state, opensAt, closesAt }` where `state` is
one of `ALWAYS | SCHEDULED | OPEN | CLOSED`. The API filters unpublished and
out-of-window quizzes out of the student catalogue, and refuses `start` outside
the window with `QUIZ_NOT_OPEN_YET` / `QUIZ_CLOSED`.

The UI state machine (`apps/web/src/lib/student-params.ts`) has six values —
`start | resume | exhausted | unavailable | scheduled | closed` — with `resume`
first for the reason above. A scheduled paper shows "Opens in 3 hours" (or the
ISO date beyond 14 days); a closed one shows when it closed. Both buttons are
dimmed _and_ disabled, so the state is legible to a screen reader, not just to
someone who notices the colour.

**Tests:** `packages/shared/src/availability.test.ts`,
`apps/web/src/lib/student-params.test.ts`, and the seed supports a scheduled quiz
(`cyber-security-basics` opens in three days with a 0.5 penalty).

---

## 5. Certificates

Certificates are issued when a graded attempt **passes** on a quiz with
`certificate_enabled`:

- `issueCertificate` is idempotent per `attemptId` — the unique index on
  `certificates.attempt_id` is the guard, so a double submit or a retried request
  cannot mint a second certificate.
- The code is `QP-XXXX-XXXX` from an unambiguous alphabet (no `0/O`, `1/I`), so it
  can be read off paper and typed back in.
- The result payload carries `certificateCode`, and the result screen links
  straight to `/student/certificates/:code`.
- Verification is public and case-insensitive: `/verify` for a lookup form,
  `/verify/:code` for a shared link, backed by `GET /api/certificates/verify/:code`.
  An unknown code is a clean `404 CERTIFICATE_NOT_FOUND`, not an empty page.
- The certificate page is designed to print (`print:` rules drop the chrome), and
  the office's verification page shows the same data a third party would check.

The student has a list at `/student/certificates`, and their profile counts them.

**Tests:** `packages/shared/src/certificate.test.ts`,
`apps/api/src/__tests__/submissions.test.ts` (a pass mints one; a failure mints
none; a repeat submit mints none).

---

## 6. Email notifications

Nothing here talks SMTP. Every message is written to `email_outbox` with a kind
(`WELCOME | PASSWORD_RESET | RESULT | CERTIFICATE`), a status
(`QUEUED | SENT | FAILED`), the address, the body and the row it is about. A
worker — or an operator, from `/admin/emails` — is what actually sends.

This is a deliberate trade:

- the platform never depends on a mail server being up to finish a request;
- every message that _would_ have been sent is inspectable, which is what makes
  the feature testable at all without network access;
- a failed send is visible as `FAILED` with an `error`, instead of a log line
  nobody reads.

The three triggers §26 names:

| Event                                     | Kind          | Related row     |
| ----------------------------------------- | ------------- | --------------- |
| Sign-up                                   | `WELCOME`     | the user        |
| Attempt graded (manual, deadline or late) | `RESULT`      | the attempt     |
| A certificate is issued                   | `CERTIFICATE` | the certificate |

### The transport

Where a message actually goes is configuration, not code:

| `MAIL_TRANSPORT` | What happens                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `log` (default)  | The whole message goes to stdout and the row is marked `SENT`. Development needs no mail server, and a reset link is still readable. |
| `webhook`        | `POST { to, from, subject, text }` to `MAIL_WEBHOOK_URL`. Any relay or in-house mailer works.                                        |
| `resend`         | The Resend HTTP API, used automatically when `RESEND_API_KEY` is set.                                                                |

`MAIL_FROM` sets the `From:` line. There is deliberately no SMTP client: an SMTP
socket and its timeout behaviour is a dependency to get wrong, and every provider
that matters offers an HTTPS endpoint that `fetch` already reaches. A transport
failure throws, and `deliver()` records the reason against the row — a transport
problem never looks like a successful send.

### The console

`/admin/emails` lists the outbox with kind, status, recipient and the full body
(inside a native `<details>`, so it can be selected and copied), states which
transport the process is using, and offers both actions a queue needs:

- **Send queued** — `POST /api/admin/emails/drain`, which tries every `QUEUED`
  row once and reports how many left and how many are still waiting.
- **Retry / Resend** — `POST /api/admin/emails/:id/retry`, which flips the row
  back to `QUEUED`, hands it to the transport and reports the state it ended in.
  A `SENT` row is a no-op rather than a second send, and an unknown id is a clean
  `404 EMAIL_NOT_FOUND`.

Both call the same transport the original send used, so what an administrator
triggers from the console is exactly what a request would have done.

A fresh seed leaves the outbox at `{queued 1, sent 4, failed 0, total 5}`.

**Tests:** `packages/shared/src/email.test.ts` (the templates),
`apps/api/src/__tests__/submissions.test.ts` (a graded paper queues exactly one
result mail), plus the outbox counts in the seed.

---

## 7. Appearance — the light / dark toggle

The default is dark: the product is a film, and the consoles are the same room
with the lights low.

The toggle sits under the section rail in **both consoles**
(`components/theme-toggle.tsx`), and it is a real light theme, not a dimmer:

- `[data-theme='light']` in `globals.css` redefines every design token — paper
  background, ink foreground, inverted primary — _and_ remaps the handful of raw
  utilities the components use directly (`text-white`, `bg-white/6`,
  `border-white/12`, `ring-white/15`, and the `bg-black/55` scrim the header
  wears when scrolled), because a token cannot reach a class that says
  `text-white`.
- The attribute is put on the **console shell**, not on `<html>`. The landing
  page is a film of a dark room; flipping it to paper would erase the thing it is
  built around. Auth screens are part of that film for the same reason.
- The choice is stored in the `quiz_theme` cookie and read **on the server**
  (`lib/theme-server.ts`, spread by the layout), so the first painted frame is
  already correct. An inline script that flips a class after parse is the usual
  approach and always flashes the wrong colour for a frame.
- The control is two labelled buttons in a `role="group"`, each with
  `aria-pressed`, not a mystery switch: a screen reader should hear which of the
  two is on, not "toggle button".

Inside the light theme, the room behind the console is re-lit rather than left
black: the film still is inverted, washed out and dropped to 10%, the dust GIF is
hidden (it is a dark additive layer), and the veil becomes a paper gradient.

**Tests:** `apps/web/src/lib/theme.test.ts` (parsing, the dark fallback, the
cookie name), plus the server-rendered `data-theme` assertions in the smoke run.

---

## 8. Bulk question import (CSV / Excel)

`POST /api/admin/quizzes/:quizId/questions/import` with
`{ text: string, dryRun?: false }`, validated by `questionImportRequestSchema`.

The format is CSV, one question per row:

```
question,option1,option2,option3,option4,correct,explanation,marks,difficulty
What does === compare?,Value and type,Value only,Type only,Reference,1,Strict equality also checks the type,2,MEDIUM
```

- The header row is optional; a header is detected by its first cell.
- `correct` is **1-based** — `1` means `option1`. That is what a person writes in
  a spreadsheet; computers count from zero, people do not.
- `option3` / `option4` may be blank for a two-option question.
- `explanation`, `marks` and `difficulty` are optional (`marks` defaults to 1,
  `difficulty` to `EASY`).
- RFC 4180 in full: quoted cells, doubled quotes, commas inside quotes, CRLF, and
  the UTF-8 BOM Excel writes. The parser is in `packages/shared/src/import.ts` and
  is tested against each of those cases.
- Limits: 200 rows, 256 kB, refused with `MAX_IMPORT_BYTES` / row-cap messages
  rather than truncated silently.

The dialog (`components/question-import.tsx`) accepts a dropped file, a chosen
`.csv`, or pasted text, and previews the parse — accepted rows, skipped rows and
per-line issues — before anything is written. `dryRun: true` returns the same
preview from the API without inserting.

**On Excel:** `.xlsx` is accepted directly. A workbook is a ZIP of XML, so the
browser unzips it (`fflate`, 8 kB), reads the first sheet's cell values
(`packages/shared/src/xlsx.ts`) and converts the rows to the _same CSV text_ the
endpoint already takes (`toCsv`, `parseQuestionImportRows`). Three consequences
worth stating:

- **There is one server contract, not two.** The API never sees a zip; a
  spreadsheet and a `.csv` travel the identical path, so they cannot drift in
  what they accept.
- **The file is parsed where the preview is.** Dropping a workbook shows the same
  per-row issues and accepted count a `.csv` does, before anything is sent.
- **The detection is by content, not extension.** `isWorkbook()` checks the ZIP
  magic, so a `.xlsx` renamed to `.txt` still works and a `.csv` with a BOM is
  still read as text. The legacy binary `.xls` is not a zip and is refused with a
  one-line instruction ("re-save it as .xlsx or CSV") rather than a stack trace.

What the reader deliberately does not do: formulas (it reads the cached value,
which is what the sheet shows), styling, merged cells, or any sheet but the
first. None of those carry meaning for a question import.

`packages/shared/src/xlsx.test.ts` builds real workbooks with `zipSync` —
shared-string cells, inline strings, gapped columns, a missing rels part, a zip
with no worksheet — and asserts that the round trip through `toCsv` produces
questions identical to the CSV path.

**Tests:** `packages/shared/src/import.test.ts` (quoting, BOM, CRLF, blank lines,
header detection, bad rows, caps), `packages/shared/src/xlsx.test.ts` (real
workbooks, gapped cells, missing parts, round trip),
`apps/api/src/__tests__/admin-questions.test.ts` (dry run writes nothing, the real
run writes everything, an unauthorised caller is refused).

---

## 9. Endpoint map — specification §25 vs this build

The specification's list, the route this build serves, and the honest difference.
Everything under `/api` is the Hono app; the branches are mounted in
`apps/api/src/app.ts`.

| §25 endpoint                     | Served as                                                                                   | Notes                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`        | `POST /api/auth/register`                                                                   | Always creates a `STUDENT`; the role is never client-chosen.                                                                                                                            |
| `POST /api/auth/login`           | `POST /api/auth/login`                                                                      | Sets the httpOnly `quiz_session` cookie.                                                                                                                                                |
| `POST /api/auth/logout`          | `POST /api/auth/logout`                                                                     | Idempotent.                                                                                                                                                                             |
| `GET /api/auth/me`               | `GET /api/auth/me`                                                                          | The session the web app renders from.                                                                                                                                                   |
| `POST /api/auth/forgot-password` | `POST /api/auth/forgot-password`                                                            | Always `202`, identical body for known and unknown addresses.                                                                                                                           |
| `POST /api/auth/reset-password`  | `POST /api/auth/reset-password`                                                             | Single-use token, 60 minutes, SHA-256 stored.                                                                                                                                           |
| — (not in §25)                   | `POST /api/auth/change-password`                                                            | Added: change from inside a session, requires the current password, kills outstanding reset links.                                                                                      |
| `GET /api/quizzes`               | `GET /api/student/quizzes`                                                                  | Student-scoped: published _and_ inside their availability window. The admin list is `GET /api/admin/quizzes`.                                                                           |
| `GET /api/quizzes/:id`           | `GET /api/student/quizzes/:id`                                                              | Includes the caller's attempt state for that quiz.                                                                                                                                      |
| `POST /api/quizzes/:id/start`    | `POST /api/student/quizzes/:id/start`                                                       | Deals the randomisation, freezes `negativeMarks`, enforces the window and the attempt cap.                                                                                              |
| `GET /api/attempts/:id`          | `GET /api/student/attempts/:id`                                                             | The paper, with the timer and the dealt order replayed.                                                                                                                                 |
| `POST /api/attempts/:id/answers` | `PUT /api/student/attempts/:id/answers/:questionId`                                         | **Method and path differ.** One answer per call, keyed by question — it is an idempotent upsert, which `PUT` states correctly; `POST` on a collection would imply an append.            |
| `POST /api/attempts/:id/submit`  | `POST /api/student/attempts/:id/submit`                                                     | No body: the server decides manual vs deadline from `expiresAt`. Repeat calls replay the same result.                                                                                   |
| `GET /api/attempts/:id/result`   | `GET /api/student/attempts/:id/review`                                                      | **Path differs**: the review is the result plus the answer key (correct option, chosen option, explanation), which is what the screen actually needs. Submit already returns the score. |
| `GET /api/attempts`              | `GET /api/student/attempts`                                                                 | Attempt history, filterable and sortable. Admin view: `GET /api/admin/attempts`.                                                                                                        |
| `GET /api/leaderboard`           | `GET /api/leaderboard`                                                                      | `?metric=highest\|average\|completed`, `?period=all\|weekly\|monthly`, `?categoryId=`.                                                                                                  |
| `GET /api/categories`            | `GET /api/categories` (public) + `GET /api/admin/categories`                                | The student catalogue reads categories from the database at runtime, never a hardcoded list.                                                                                            |
| `GET /api/admin/users`           | `GET /api/admin/users`                                                                      |                                                                                                                                                                                         |
| `PATCH /api/users/:id/status`    | `PATCH /api/admin/users/:id/status`                                                         | **Prefixed with `/admin`**, like every admin route, so the authorization middleware has one boundary to guard.                                                                          |
| `DELETE /api/users/:id`          | `DELETE /api/admin/users/:id`                                                               | Cascades attempts, answers, certificates and reset links; returns how many attempts went with the account.                                                                              |
| — (not in §25)                   | `GET /api/admin/users/:id/profile`                                                          | Added for §6's "student profile/history/performance" view; the same builder serves the student's own `GET /api/student/profile`.                                                        |
| — (not in §25)                   | `GET /api/admin/attempts`, `GET /api/admin/attempts/:id`                                    | Added: §6's attempt oversight, filtered by quiz, student and status.                                                                                                                    |
| — (not in §25)                   | `GET /api/admin/emails`, `POST /api/admin/emails/drain`, `POST /api/admin/emails/:id/retry` | Added: the outbox from §26's email requirement — inspectable, drainable, and retryable per message.                                                                                     |
| — (not in §25)                   | `GET /api/student/certificates`                                                             | Added: the student's own certificates.                                                                                                                                                  |
| — (not in §25)                   | `GET /api/certificates/verify/:code`                                                        | Added and public: the third party's check, which is the point of a certificate.                                                                                                         |
| — (not in §25)                   | `POST /api/admin/quizzes/:quizId/questions/import`                                          | Added: §26's import.                                                                                                                                                                    |
| — (not in §25)                   | `GET /api/landing`, `GET /api/meta`, `GET /api/health`, `GET /api/admin/system`             | Added for the landing page's live data, the version stamp, and the deployment gate.                                                                                                     |

Two conventions behind the table:

- **Every admin mutation lives under `/api/admin`.** §25 lists a few of them at
  the top level (`/api/users/:id`); grouping them means a single middleware
  guards the whole surface, and a route added six months from now inherits the
  guard instead of needing to remember it.
- **Student routes are `/api/student/*`** for the same reason, and because the
  same noun ("attempts") means something different to an admin than to the person
  who sat the paper.

---

## 10. What is not built, and why

**Question types other than multiple choice.** The schema, the grader, the
review screen and the CSV importer are all built around one question shape:
prompt, 2–4 options, exactly one correct. Adding true/false is a subset (it
already works — two options), but multi-select, short answer and ordering would
each need a different grader, a different review layout and a different import
format. They are a deliberate scope decision, not an oversight: a half-built
second type is worse than one type that is correct everywhere. The schema stores
a `questions` row with options, so adding a `type` discriminator later is a
migration, not a rewrite.

Everything else in §26 is implemented and covered by the tests named above.
