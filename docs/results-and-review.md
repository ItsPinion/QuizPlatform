# Results, answer review & attempt history (Day 9)

Day 8 ends with a number. Day 9 turns that number into feedback: the paper comes back question by
question, a filter narrows the list to what went wrong, and every attempt a student has ever taken is
one page away.

Three screens, two endpoints, one rule.

```
/student/attempt/:id          the score (Day 8) + "Review answers"
/student/attempt/:id/review   the paper with the key, verdicts and explanations
/student/results              attempt history, filters and per-row review links
```

---

## The rule that makes the review safe

**The answer key only exists once the attempt is finished.**

`GET /api/student/attempts/:id/review` is the only payload in the product that carries
`isCorrect`, `correctOptionId` and `explanation`. It refuses everything else:

| Attempt state                   | Response                                     |
| ------------------------------- | -------------------------------------------- |
| finished, owned by the caller   | `200` — the full review                      |
| still `IN_PROGRESS`             | `409 ATTEMPT_NOT_ACTIVE`, no key in the body |
| another student's               | `404 ATTEMPT_NOT_FOUND`                      |
| unknown id                      | `404 ATTEMPT_NOT_FOUND`                      |
| malformed id                    | `422`                                        |
| admin calling the student route | `403 FORBIDDEN`                              |

The `409` matters more than it looks: without it, a student could open the review in a second tab
mid-quiz and read every answer. The check is on the stored status, not on a query parameter.

The review route also runs the Day 8 sweep first (`expireStaleAttempts`), so an attempt whose
deadline just passed is graded and reviewable instead of stuck at "in progress".

## What one review contains

```json
{
  "attempt": { "id": "…", "status": "FAILED", "startedAt": "…", "completedAt": "…",
               "timeTakenSeconds": 861, "autoSubmitted": false },
  "quiz":    { "id": "…", "title": "JavaScript Fundamentals", "slug": "…",
               "categoryName": "JavaScript", "difficulty": "MEDIUM", "passingScore": 60 },
  "result":  { "score": 8, "totalMarks": 10, "percentage": 80, "correctAnswers": 16,
               "incorrectAnswers": 3, "unanswered": 1, "passed": true, "status": "PASSED", … },
  "questions": [
    {
      "id": "…", "position": 2, "questionText": "Which declaration cannot be reassigned?",
      "marks": 2, "difficulty": "MEDIUM",
      "explanation": "const binds a name for good; let and var can be reassigned.",
      "type": "MCQ",
      "selectedOptionId": "…", "selectedOptionIds": [], "answerText": null,
      "correctOptionId": "…",
      "verdict": "INCORRECT", "earnedMarks": 0,
      "options": [
        { "id": "…", "text": "var",   "position": 0, "isCorrect": false, "selected": false },
        { "id": "…", "text": "let",   "position": 1, "isCorrect": false, "selected": true  },
        { "id": "…", "text": "const", "position": 2, "isCorrect": true,  "selected": false }
      ]
    }
  ],
  "counts": { "all": 20, "correct": 16, "incorrect": 3, "unanswered": 1 }
}
```

`result.formats` carries the same paper split by question format —
`[{ type: 'MCQ', total, correct, incorrect, unanswered }, …]` in `QUESTION_TYPES`
order. It is derived from the questions the grader just marked, so it cannot
contradict `correctAnswers`.

Details worth knowing:

- **Three verdicts, never two.** `CORRECT`, `INCORRECT`, `UNANSWERED`. A blank question is not a
  wrong guess — the counts in the review always add up to the paper, and `counts.correct` equals
  `result.correctAnswers` because both come from the same grading rules.
- **A stale selection reads as unanswered.** A saved answer that points at an option which no longer
  exists (an admin deleted it mid-attempt) is treated as no answer, exactly as Day 8's grader does —
  so the review and the score can never disagree.
- **`earnedMarks` per question** sums to `result.score`. Marks are all-or-nothing per question, which
  is what the grader implements.
- **Explanations are optional.** `null` when the author did not write one; the UI says so instead of
  rendering an empty box.
- **`autoSubmitted`** is derived from `completedAt >= expiresAt`, so the review can say "the clock
  ended this one" without a separate flag in the database.
- **Every format reads the same way.** A `MULTI` question carries its whole
  `selectedOptionIds` set and the verdict is all-or-nothing on the set; a
  `FILL_BLANK` question carries `answerText` and shows its options (which are the
  accepted answers) as the key. `answerVerdict` is one function for all four
  formats, so a review cannot mark a set differently from the grader. The formats
  themselves are in [`question-formats.md`](question-formats.md).

## Attempt history

```
GET /api/student/attempts?status=PASSED&quizId=…&sort=score&page=1&pageSize=10
```

| Parameter  | Values                                | Default  |
| ---------- | ------------------------------------- | -------- |
| `status`   | `PASSED` \| `FAILED` \| `IN_PROGRESS` | all      |
| `quizId`   | a quiz uuid                           | all      |
| `sort`     | `newest` \| `oldest` \| `score`       | `newest` |
| `page`     | ≥ 1                                   | `1`      |
| `pageSize` | 1–50                                  | `10`     |

Response: `{ attempts[], pagination, filters, totals }`.

- Every row carries the quiz title, slug, category and difficulty, the status, `passed`,
  `inProgress`, the score and marks, the three counts, `completedAt`, `timeTakenSeconds` and
  `autoSubmitted`.
- An attempt that is still running has `percentage: 0`, `completedAt: null` and
  `timeTakenSeconds` computed to _now_ — it is shown as "still running" and links back into the
  taker rather than into a review.
- `totals` is computed over the **whole** history, not the current page: attempts, passed, failed,
  in-progress and the best percentage among finished attempts. That is deliberately a little more
  than Day 9 needs — Day 10's dashboard is built on the same numbers.
- The sweep runs before the query, so a timed-out attempt is settled and appears with its real
  verdict instead of "in progress".

## The screens

### `/student/attempt/:id/review`

- Header: quiz, category, difficulty, the pass/fail badge, percentage, `16 of 20 correct`,
  `score of marks`, pass mark, minutes taken and an **auto-submitted** chip when the clock ended it.
- Filter chips with live counts — `All 20`, `Correct 16`, `Incorrect 3`, `Unanswered 1` — as plain
  links to `?filter=…`, so the view is shareable, reloadable and works without JavaScript.
- A **By format** strip after the header when the paper mixed formats:
  `Multiple choice · 3 of 4 correct`.
- One card per question: its **original number** (`Question 7 of 20`, even when a filter hides the
  others), its **format**, difficulty, verdict badge, marks earned, the answer given
  (options with `your answer` / `correct` markers, every ticked box on a set, or the typed text
  beside the accepted list), a sentence describing the outcome, and the explanation.
- An empty filter state that links back to the full paper.
- A link back to the score.

### `/student/results`

- Four totals: attempts, passed, failed, best score.
- Status chips (`All`, `Passed`, `Failed`, `In progress`) and sort chips (`Newest`, `Oldest`,
  `Best score`), all as links that keep each other's value.
- Rows: quiz, status badge, an `auto` chip when relevant, category, when it finished, the counts,
  the percentage and `score / marks`. Finished rows offer **Review** and **Score**; a running row
  offers **Resume**.
- Pagination that disables its own ends.
- An empty state that distinguishes "you have not taken anything yet" from "nothing matches this
  filter".

### Linking back

The Day 8 result card now carries **Review answers** instead of a disabled placeholder. The review
screen links back to the score, and both are reachable from the history.

## Errors

| Situation                                | Response                 |
| ---------------------------------------- | ------------------------ |
| review of a live attempt                 | `409 ATTEMPT_NOT_ACTIVE` |
| review of another student's              | `404 ATTEMPT_NOT_FOUND`  |
| unknown attempt                          | `404 ATTEMPT_NOT_FOUND`  |
| malformed attempt / quiz id              | `422 VALIDATION_ERROR`   |
| `page=0`, `pageSize=51`, bad sort/status | `422`                    |
| admin on any student route               | `403 FORBIDDEN`          |
| anonymous                                | `401 UNAUTHORIZED`       |

## Tests

- `packages/shared/src/review.test.ts` (13) — the verdict function (including "no key means no
  correct"), earned marks, the tally, filter matching, the review and history schemas, query
  defaults and caps, and the status labels.
- `apps/api/src/__tests__/reviews.test.ts` (11) — a full review over HTTP with a hand-built
  correct / wrong / blank paper, `earnedMarks` summing to the stored score, each question's key
  released with the option flagged, the explanations arriving, the `409` for a live attempt (with no
  key in the body), owner-only `404`s, the admin `403`, a seeded attempt reviewable, history scoping,
  totals agreeing with the rows, status/quiz filters, score sorting, pagination, the sweep settling a
  timed-out attempt before listing it, and the query validation matrix.
- `apps/web/src/lib/review-params.test.ts` (16) — review filter parsing and href round-trips,
  history filter parsing, `toHistoryQuery`, history href round-trips (never emitting a dropped
  value), verdict labels and tones, position and marks labels, the selection sentence, filter
  options, history tones and the timestamp formatter.
- `scripts/e2e-smoke.ts` — five checks over real HTTP: the review of the submitted attempt, the
  `409` for a live one, the history containing the graded paper, the status filter, and a
  cross-student `404`.

## Trade-offs

- **The review is a second read, not a snapshot.** It reflects the questions and options as they
  exist now, matched to the saved answers. If an admin edits a quiz after it was attempted, the
  review shows the new wording (and a deleted option simply disappears, so its answer reads as
  unanswered). Freezing the paper per attempt is the real fix and is the same note Day 8 left.
- **One page = one query plus three aggregates.** `totals` is a separate grouped query rather than a
  window function, because SQLite's window support through Drizzle would be harder to read for no
  measurable gain at this size.
- **No per-question timing.** The review shows the whole attempt's duration; question-level timings
  are out of scope.
- **History is not searchable by title yet.** The filter is by quiz id (the UI links from a quiz), and
  Day 10's dashboard adds the cross-quiz statistics.
