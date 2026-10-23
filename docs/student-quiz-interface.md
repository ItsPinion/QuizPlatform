# Student quiz interface (Day 7)

Days 2–6 built everything an admin needs. Day 7 opens the other door: a student can
browse what is published, read the rules before committing, start an attempt, move
between questions, and have every answer saved.

Three constraints shaped the implementation:

1. **Only published quizzes exist** for a student. A draft answers `404`, exactly like a
   quiz that never existed — otherwise a guessed id would reveal the catalogue an admin
   has not released.
2. **The server owns the clock.** `expiresAt` is stamped at start and re-checked on every
   write. The countdown in the UI is a mirror of that timestamp, not a timer that decides
   anything.
3. **The browser never receives the answer key.** The attempt payload has option text and
   positions only: no `isCorrect`, no explanation, no marks keyed to correctness.

The spec lists these as `/api/quizzes/:id/start` and `/api/attempts/:id`. They live under
the guarded `/api/student` namespace instead (same deviation as Day 5), so the role check
is inherited and an attempt can only ever be its owner's.

---

## Endpoints

| Method | Path                                            | Purpose                                         |
| ------ | ----------------------------------------------- | ----------------------------------------------- |
| `GET`  | `/api/student/categories`                       | Categories with at least one published quiz     |
| `GET`  | `/api/student/quizzes`                          | Catalogue + the caller's attempt state          |
| `GET`  | `/api/student/quizzes/:id`                      | One quiz + whether it can be started            |
| `POST` | `/api/student/quizzes/:id/start`                | Start an attempt, or resume the one in flight   |
| `GET`  | `/api/student/attempts/:id`                     | Questions, saved answers and the remaining time |
| `PUT`  | `/api/student/attempts/:id/answers/:questionId` | Save or clear one answer                        |

All of them are `403` for an admin and `401` anonymously.

---

## The catalogue

`GET /api/student/quizzes?search=&categoryId=&difficulty=&sort=&page=&pageSize=`

Each row carries what a student needs to decide, not what an admin needs to manage:

```json
{
  "id": "…",
  "title": "CSS Essentials",
  "categoryName": "CSS",
  "difficulty": "MEDIUM",
  "durationMinutes": 15,
  "passingScore": 60,
  "questionCount": 4,
  "totalMarks": 4,
  "maxAttempts": 3,
  "attemptsUsed": 1,
  "attemptsRemaining": 2,
  "bestPercentage": 75,
  "inProgressAttemptId": null
}
```

The aggregates come from **four small queries** rather than one wide join: counting
questions, summing marks and aggregating attempts in a single statement multiplies rows
(4 questions × 3 attempts = 12) and makes every aggregate need `distinct`. Two `inArray`
passes are easier to read and impossible to get subtly wrong.

`inProgressAttemptId` is set **only for a live attempt** — status `IN_PROGRESS` _and_
`expiresAt > now`. An attempt whose deadline has passed is spent: it still counts towards
`attemptsUsed`, but it can no longer be resumed or written to.

Categories are exposed separately at `/api/student/categories` and only include categories
that hold at least one published quiz, so the filter never lists a name that yields nothing.

---

## Before starting

`GET /api/student/quizzes/:id` returns the quiz plus a decision made by the same shared
function the API uses when the button is pressed:

| Situation                        | `start`                                                |
| -------------------------------- | ------------------------------------------------------ |
| published, tries left            | `{ allowed: true }`                                    |
| a live attempt exists            | `{ allowed: true }` — resuming is not a new try        |
| every attempt used               | `403`-style payload: `409 ATTEMPTS_EXHAUSTED` on start |
| unpublished / draft / unknown id | `404 QUIZ_NOT_FOUND`                                   |
| published but no questions       | `409 QUIZ_HAS_NO_QUESTIONS`                            |

`startDecision()` lives in `packages/shared/src/attempt.ts`, so the disabled button and the
409 message are generated from one rule instead of two that can drift.

---

## Starting and resuming

```
POST /api/student/quizzes/:id/start   → 201 { attemptId, resumed: false, expiresAt, secondsRemaining }
POST (again, same quiz)               → 201 { attemptId: same, resumed: true, expiresAt: same }
```

- The attempt is created with `startedAt = now`, `expiresAt = now + durationMinutes`,
  `status = IN_PROGRESS`, `score = 0` and `totalMarks` snapshotted from the quiz.
- A second call returns the attempt already in flight. **Resuming never costs a try**, so a
  refresh, a closed tab or a double click is harmless.
- An attempt past its deadline is not resumable. Since Day 8 the next student read settles it
  (grades it, auto-submitted), and starting again creates a new row if attempts remain.

---

## Taking it

`GET /api/student/attempts/:id` — owner only, everyone else gets `404 ATTEMPT_NOT_FOUND`.

```json
{
  "attempt": {
    "status": "IN_PROGRESS",
    "expiresAt": "…",
    "secondsRemaining": 872,
    "expired": false,
    "serverNow": "…"
  },
  "quiz": { "title": "CSS Essentials", "durationMinutes": 15, "passingScore": 60, "totalMarks": 4 },
  "questions": [
    {
      "id": "…",
      "position": 0,
      "questionText": "…",
      "marks": 1,
      "options": [{ "id": "…", "text": "…", "position": 0 }]
    }
  ],
  "answers": [{ "questionId": "…", "selectedOptionId": null }]
}
```

`serverNow` is included so the client can correct for clock skew between machines.

### Saving answers

```
PUT /api/student/attempts/:id/answers/:questionId
{ "optionId": "<uuid>" }        → 200, answer saved
{ "optionId": null }            → 200, answer cleared
```

| Situation                       | Answer                   |
| ------------------------------- | ------------------------ |
| attempt belongs to someone else | `404 ATTEMPT_NOT_FOUND`  |
| attempt already finished        | `409 ATTEMPT_NOT_ACTIVE` |
| deadline passed, still open     | `409 ATTEMPT_EXPIRED`    |
| question not in this attempt    | `422 QUESTION_NOT_FOUND` |
| option not in that question     | `422 OPTION_NOT_FOUND`   |

Writes are one question at a time, so a closed tab loses at most one click. `is_correct`
is left `null` until submission: grading is never accepted from the client.

---

## The screen

```
/student                    overview: resume banner, counts, best score, three suggestions
/student/quizzes            catalogue: filters in the URL, pagination, cards
/student/quizzes/:id        rules before starting + start/resume button
/student/attempt/:id        the taker
```

The taker (`components/quiz-runner.tsx`) has:

- **one question at a time** with `Previous` / `Next`, plus a numbered grid that shows which
  questions are answered and jumps straight to any of them;
- **a countdown** derived from `expiresAt`, turning amber at five minutes and red at one;
- **optimistic selection with rollback** — a radio moves immediately, and if the `PUT` is
  rejected the previous choice comes back with the API's message;
- **re-sync on tab focus** — when the tab becomes visible again it re-reads the attempt, so a
  throttled background timer cannot silently drift;
- **a locked state** at zero: options disabled, a banner saying the attempt is being submitted,
  and no way to write more (the API would refuse anyway). The countdown submitting itself is
  [Day 8](submission-and-scoring.md).

Answers survive a refresh because the page is server-rendered from the API on every load —
there is no client cache to lose.

### Where Day 8 takes over

**Submit quiz** and the countdown both post to `POST /api/student/attempts/:id/submit`; the
attempt screen swaps to a result card once a result exists, and a finished attempt loads
straight into that card. The grading rules, the lazy expiry sweep and the result payload are in
[`submission-and-scoring.md`](submission-and-scoring.md).

---

## Tests

| Layer  | File                                             | Covers                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared | `packages/shared/src/attempt.test.ts`            | `secondsRemaining` (rounding, negatives, Dates/timestamps), `formatClock`, every `startDecision` branch, progress counting, timer tones, the answer and list-query schemas                                                                                                                                |
| API    | `apps/api/src/__tests__/student-quizzes.test.ts` | published-only listing, per-student aggregates, filter/sort/422s, 404 for drafts, start + deadline arithmetic, resume-not-spend, exhaustion, no answer key in the payload, ownership 404s, save/replace/clear, option and question validation, finished-attempt and expired-attempt locks, 403 for admins |
| Web    | `apps/web/src/lib/student-params.test.ts`        | catalogue filter parsing and href round-trips, start state/labels, attempts and score labels, clock text, progress, timer tones                                                                                                                                                                           |
| E2E    | `scripts/e2e-smoke.ts`                           | 8 Day-7 checks over real HTTP: published-only list, draft 404, start + resume, no `isCorrect` in the payload, answer round-trip, cross-student 404, admin 403                                                                                                                                             |

```bash
bun run test        # 523 Vitest tests
bun run test:e2e    # 58 checks against a live API + throwaway database
```

---

## Known trade-offs

- **Expiry is lazy, not scheduled.** An attempt past its deadline refuses writes; it is graded
  by the next student read (or the client's auto-submit), which is covered in
  [`submission-and-scoring.md`](submission-and-scoring.md).
- **No question randomisation yet.** The spec's §"Question Randomization" is an enhancement;
  questions are shown in the admin's order today.
- **Answers are written one at a time.** A bulk "save all" endpoint would cut requests, but
  it would also make a partial failure ambiguous; per-question writes keep the last click
  and nothing else.
