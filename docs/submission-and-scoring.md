# Submission & scoring (Day 8)

Day 7 could start an attempt, save answers and show a countdown. Day 8 closes the loop: the paper
is graded on the server — when the student clicks **Submit**, and when the clock runs out.

What this milestone deliberately does **not** do: show the per-question review. The result card
gives the verdict, the counts and the time; correctness per answer and explanations are Day 9.

---

## The contract

```
POST /api/student/attempts/:id/submit
```

No request body. The server decides everything that matters:

| Decision           | How                                                          |
| ------------------ | ------------------------------------------------------------ |
| Was it manual?     | `now < expiresAt`                                            |
| Was it automatic?  | `now >= expiresAt` — `completedAt` is clamped to `expiresAt` |
| What is correct?   | the answer key in `options.is_correct`, never the client     |
| What is the score? | `gradeAttempt()` over the saved answers                      |

Response (`200`, always — a submission that already happened is not an error):

```json
{
  "attemptId": "…",
  "quizId": "…",
  "alreadySubmitted": false,
  "result": {
    "score": 8,
    "totalMarks": 10,
    "percentage": 80,
    "correctAnswers": 16,
    "incorrectAnswers": 3,
    "unanswered": 1,
    "passingScore": 60,
    "passed": true,
    "status": "PASSED",
    "timeTakenSeconds": 861,
    "startedAt": "2026-01-01T12:00:00.000Z",
    "completedAt": "2026-01-01T12:14:21.000Z",
    "autoSubmitted": false
  }
}
```

There is still **no `isCorrect` and no `explanation` anywhere** in the body — grading data stays
server-side even after the paper is closed.

---

## One grader, two ways in

`gradeAttempt()` in `packages/shared/src/submission.ts` is a pure function. It takes the questions
(with marks and the option key), the saved answers and the quiz's pass mark, and returns the whole
breakdown. Both paths call it through the same API handler:

```
student clicks Submit ─┐
                       ├─→ POST /submit ─→ gradeAttempt() ─→ attempt row + is_correct
countdown hits 0 ──────┘
```

Grading rules, in order of subtleness:

1. **A question is answered** only when the saved `selectedOptionId` is one of _that_ question's
   options. A stale selection (an option deleted while the attempt was open) counts as unanswered
   rather than incorrect — the student never expressed a choice the platform could read.
2. **Marks are per question.** `score` is the sum of the marks of correctly answered questions;
   `totalMarks` is the sum over the whole paper. A weighted quiz scores correctly, and
   `percentage = round(score / totalMarks * 10000) / 100`.
3. **An empty paper can never pass**, even if the pass mark is `0`.
4. **Pass is `percentage >= passingScore`**, inclusive — 60% passes a 60% quiz.

## Expiry is lazy

There is no cron and no queue in this project. Instead:

- the client authorises nothing: when its countdown reaches zero it calls `/submit`, and the server
  derives `autoSubmitted` from `expiresAt`;
- **every student read settles stale attempts first.** `GET /api/student/quizzes`,
  `GET /api/student/quizzes/:id`, `POST …/start` and `GET /api/student/attempts/:id` call
  `expireStaleAttempts(userId)`, which grades any `IN_PROGRESS` attempt whose deadline has passed
  (bounded to 50 per request).

That means a student who closes the laptop mid-quiz and comes back tomorrow sees a graded result on
their next page load, and the catalogue's "best score" includes the attempt the clock ended. A client
that submits late is accepted rather than rejected: `completedAt` is clamped to `expiresAt`, so the
stored time taken is exactly the duration and the late network call cannot buy or lose marks.

### What changes for the Day 7 screens

- `expired: true` is now only true for an _open_ attempt whose deadline has passed (for example
  during a write race). A graded attempt reports `expired: false` and `result: {…}`, because it is
  finished, not merely expired.
- `PUT …/answers/:questionId` after the deadline answers `409 ATTEMPT_EXPIRED` while the row is still
  open, and `409 ATTEMPT_NOT_ACTIVE` once a read (or the submit) has graded it. Both codes exist on
  purpose; the UI treats them the same way.

## Idempotency

`submitAttempt` is idempotent by design:

- a double click, a retry after a timeout, and the client's auto-submit racing the server's sweep
  all reach the same handler;
- the second call returns the **stored** row with `alreadySubmitted: true` and the original
  `completedAt` — it never re-grades, so a percentage cannot move under the student.

The concurrency window is small but real: two requests arriving in the same millisecond can both
read `IN_PROGRESS` and both write. They write identical numbers (same answers, same key), so the
outcome is stable; the duplicate `is_correct` stamps are identical too.

## What gets written

One submission writes the attempt row:

| Column               | Value                                  |
| -------------------- | -------------------------------------- |
| `score`              | marks earned                           |
| `total_marks`        | marks available at grading time        |
| `percentage`         | 0–100, two decimals                    |
| `correct_answers`    | count of correctly answered questions  |
| `incorrect_answers`  | count of questions answered wrongly    |
| `unanswered`         | count of questions with no real choice |
| `time_taken_seconds` | `completedAt - startedAt`, clamped ≥ 0 |
| `status`             | `PASSED` / `FAILED`                    |
| `completed_at`       | submit time, clamped to `expires_at`   |

and then stamps `answers.is_correct` per saved answer (`true` / `false`, or `null` for a cleared
answer). Day 9's review screen reads those rows directly instead of grading a second time.

`EXPIRED` remains in the attempt-status enum but is not produced: an attempt that runs out of time
is still graded, so `autoSubmitted` (derived from `completedAt >= expiresAt`) carries that fact
without hiding the pass/fail verdict from analytics.

---

## Errors

| Situation                                | Response                           |
| ---------------------------------------- | ---------------------------------- |
| Unknown attempt id, or another student's | `404 ATTEMPT_NOT_FOUND`            |
| Malformed attempt id                     | `422` (Zod envelope)               |
| Admin calling a student route            | `403 FORBIDDEN`                    |
| Already submitted                        | `200` + `alreadySubmitted: true`   |
| Deadline passed, row already graded      | `409 ATTEMPT_NOT_ACTIVE` on writes |
| Deadline passed, row still open          | `409 ATTEMPT_EXPIRED` on writes    |

---

## The screens

`/student/attempt/:id` keeps the taker until a result exists, then swaps to the result card:

- **Submit quiz** opens an inline confirm that names how many questions are still blank (they score
  zero) — no silent one-click submission.
- **The countdown reaching `00:00`** locks the options, shows "submitting your saved answers…" and
  calls the same endpoint. If the network is down, the alert keeps a **Retry** action.
- **A finished attempt loads straight into the result**: percentage, `score of total marks`, pass
  mark, correct / incorrect / unanswered / time taken, and — only when the clock ended it — the
  "time ran out" note.
- Returning to the catalogue shows the new best score and the attempt consumed; the resume banner
  is gone because nothing is in flight.

## Tests

- `packages/shared/src/submission.test.ts` (19) — the grading matrix (correct, incorrect, blank,
  foreign option, unknown question, duplicate rows, weighted marks, two-decimal rounding, the exact
  pass boundary, the empty paper), duration maths, auto-submit detection and the wire schemas.
- `apps/api/src/__tests__/submissions.test.ts` (8) — an end-to-end start → answer → submit over the
  API, stored counts and `is_correct` stamps, wrong/cleared answers, idempotent retry, a
  deadline-passed auto-submit (including the `ATTEMPT_EXPIRED` → `ATTEMPT_NOT_ACTIVE` transition),
  the lazy sweep behind a catalogue read, no answer key in any payload, owner-only access and the
  admin 403.
- `apps/web/src/lib/student-params.test.ts` — percentage formatting, pass/fail headline and tone,
  marks line, auto-submit note, time-taken clock and the one-sentence summary.
- `scripts/e2e-smoke.ts` — submit over real HTTP, idempotent retry, locked writes, catalogue
  reflection and a cross-student 404.

## Trade-offs

- **Graded against the questions that exist at submission time.** `total_marks` is recomputed rather
  than taken from the `attempts.total_marks` snapshot, because that is what the paper actually
  contains. If an admin edits a quiz while an attempt is open, the attempt grades against the edited
  paper. Freezing the paper at start (copying questions into an attempt-specific table) is the real
  fix and is noted for a later hardening pass.
- **Lazy expiry needs a read.** An abandoned attempt is graded the next time the student touches any
  student endpoint. Nothing else in the product depends on it being graded sooner (admin analytics,
  Day 11, will need a bounded sweep of its own).
- **Time taken is per attempt, not per question.** Individual question timings are out of scope.
- **`EXPIRED` stays in the enum.** Removing a status from a live database is a migration with no
  benefit; documenting it as reserved keeps the API honest.
