# Student dashboard & performance statistics (Day 10)

```
GET /api/student/dashboard   → one payload: totals, streak, trend, categories, activity, recent
/student                     → the dashboard screen
```

Spec §15 asks for six statistics — **quizzes attempted, passed, failed, average score, highest
score, total questions answered** — and §15/§18 ask for a dashboard section with recent attempts and
performance charts. This page documents what each number means, where it is computed, and how the
charts are drawn.

---

## 1. The payload

One request, one shape (`studentDashboardSchema` in `packages/shared/src/dashboard.ts`):

```ts
type StudentDashboard = {
  totals: {
    attempts: number; // every attempt, including one still running
    quizzesAttempted: number; // distinct quiz ids
    quizzesAvailable: number; // published quizzes right now
    passed: number; // status = PASSED
    failed: number; // status = FAILED
    inProgress: number; // status = IN_PROGRESS
    averagePercentage: number | null;
    bestPercentage: number | null;
    worstPercentage: number | null;
    passRate: number | null; // passed / (passed + failed), 0–100
    questionsAnswered: number; // correct + incorrect
    questionsCorrect: number;
    accuracy: number | null; // correct / answered, 0–100
    timeSpentSeconds: number; // graded attempts only
    averageTimeSeconds: number | null;
  };
  streak: { current: number; best: number };
  trend: { attemptId; quizTitle; percentage; passed; completedAt }[]; // ≤12, oldest → newest
  categories: {
    categoryId;
    categoryName;
    attempts;
    averagePercentage;
    bestPercentage;
    passed;
    failed;
  }[]; // by name
  activity: { date; label; attempts; averagePercentage }[]; // 14 days, today last
  recent: AttemptHistoryItem[]; // ≤5, newest first
  generatedAt: string;
};
```

The student route answers `401` anonymously, `403` for an admin, and is always scoped to the session
user — there is no `userId` parameter to tamper with.

---

## 2. What the numbers mean

Every definition below is a decision, not an accident:

| Figure              | Rule                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `attempts`          | Every row, including a live one. "Attempted" is not "finished".                                               |
| `quizzesAttempted`  | `count(distinct quiz_id)` — sitting the same quiz twice is one quiz attempted. The spec's wording.            |
| `quizzesAvailable`  | `PUBLISHED` quizzes. Drafts and unpublished quizzes are not open to the student.                              |
| `passed` / `failed` | Graded statuses only. They can be smaller than `attempts` by exactly `inProgress`.                            |
| `averagePercentage` | Mean over **graded** attempts only. Averaging in a live attempt's stored `0` would read as a fail.            |
| `bestPercentage`    | Max over graded attempts, `null` before the first submission.                                                 |
| `passRate`          | `passed / (passed + failed)`, `null` with no graded attempt. Counting live attempts would deflate it.         |
| `questionsAnswered` | `correct + incorrect`. A blank question was _not_ answered, so it is not counted.                             |
| `accuracy`          | `correct / answered`, so blanks do not flatter it.                                                            |
| `timeSpentSeconds`  | Sum of `timeTakenSeconds` over graded attempts — a live attempt is still moving.                              |
| `streak`            | Consecutive `PASSED` attempts in reverse chronological order, plus the best run ever (last 50 attempts read). |
| `activity.average`  | That day's mean percentage over graded attempts; `null` on a silent day rather than `0`.                      |

Averages are rounded to two decimals, so a chart point and its label always agree.

### Lazy expiry first

`buildStudentDashboard` calls `expireStaleAttempts(userId, now)` before reading anything. A deadline
that passed a minute ago must not still look like it is running — otherwise the dashboard would show
`inProgress: 1` (and every average would exclude it) for an attempt that is really finished. The same
sweep the Day 8 submission path uses settles it, `autoSubmitted` included.

### Where it is computed

`apps/api/src/lib/student-dashboard.ts` runs six queries in parallel and never post-processes rows in
JavaScript beyond the shared helpers:

1. **Totals** — one `select` over the caller's attempts with six conditional `sum`s
   (`case when status = …`), so passed / failed / in-progress / answered / correct / graded-time all
   come from the same snapshot.
2. **Quota** — `count()` of published quizzes (independent of the student).
3. **Trend** — the newest 12 graded attempts joined to their quiz titles, then reversed, because the
   chart runs left to right in time.
4. **Categories** — `group by categories.id`, joined through quizzes, so each row is "how am I doing
   in JavaScript" rather than "in this one quiz".
5. **Activity** — `strftime('%Y-%m-%d', completed_at / 1000, 'unixepoch')` groups by UTC day.
6. **Recent** — `listAttemptHistory` with `pageSize: 5`, reusing Day 9's query so the row shape (and
   the "resume" link) is identical to `/student/results`.

They are separate queries on purpose: the group-by shapes differ, and a single join would fan rows
out and force `DISTINCT` into every aggregate. Day 10 adds no table, no column and no migration.

---

## 3. The charts

All of the geometry lives in `packages/shared/src/dashboard.ts` and is unit-tested — no chart library
was added, and no `'use client'` is needed: the SVGs render on the server.

- **Score trend** (`score-trend-chart.tsx`) — a line over the last ≤12 graded attempts, oldest first,
  on a y-axis pinned to `0–100`. A dashed rule marks the pass mark (the modal passing score, 60 by
  default), points are filled when passed, and every point carries a `<title>` tooltip with the quiz
  title, the score and the date. `scoreChartPoints` / `scoreChartPath` / `scoreChartArea` are pure
  functions of `(trend, width, height)`, so the path is testable without a DOM.
- **Activity** (`activity-chart.tsx`) — 14 CSS bars, zero-filled by `activityBuckets` so a quiet day
  keeps its slot. Height scales to the busiest day; hovering names the date and the attempt count.
- **Category breakdown** (`category-breakdown.tsx`) — one bar per category (width by average score,
  tone by pass state), with attempts and pass/fail counts, and each row links to
  `/student/quizzes?categoryId=…` so "my weakest area" is one click from practice.

`apps/web/src/lib/dashboard-params.ts` holds the presentation helpers (`percentLabel`,
`passRateLabel`, `trendDelta`, `activityCaption`, `categoryBarWidth`, …), tested separately from the
markup. Missing values render as `—`, never as `0%`: an empty dashboard should look empty, not
failing.

---

## 4. The screen

`/student` was the Day 7 catalogue and is now the dashboard — the catalogue moved to
`/student/quizzes`, which the sidebar and every link already pointed at.

- **Resume banner** — when an attempt is live, it sits at the top with the quiz title and remaining
  time; the student can finish it before reading statistics.
- **Eight stat cards** — quizzes attempted, passed, failed, average score, highest score, questions
  answered, time on quizzes and best streak. Each carries a caption (`of 8 published`,
  `75% pass rate`, `74% answer accuracy`, `46 of 63 correct`) so the number has a denominator.
- **Score trend** and **14-day activity** side by side, then the **category breakdown**.
- **Recent attempts** — five rows linking to the review, plus the full history at `/student/results`.
- **Ready when you are** — up to three published quizzes this student can still start, rendered with
  the Day 7 card, so the dashboard ends on an action rather than a number.
- **Account card** — email, status and member-since, from the session.

The page is a server component and reads the session cookie, so it is rendered per request: a
submission shows up on the next navigation with no client cache to invalidate. If the API call fails
the screen still renders with `—` placeholders and a note, exactly like the other console pages.

---

## 5. Fixture data

`packages/db/src/seed.ts` dates the demo attempts across the last two weeks — a different quiz every
few days, repeat attempts older, never in the future. That is deliberate: with every attempt three
weeks old the activity chart would be a flat line on a fresh install. A db test asserts that each
seeded student owns at least one graded attempt inside the fourteen-day window, so the fixture cannot
regress into an empty chart.

## 6. Verification

| Suite                   | What Day 10 added                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` (182) | 29 — average/pass-rate/streak edges, duration formatting, UTC day keys, zero-filled buckets, chart geometry (flat line, single point, clamp at 0–100), tone thresholds and the dashboard schema bounds                                                                                                                                                                                                                |
| `apps/api` (236)        | 12 — arithmetic checked against hand-inserted rows, every range, trend order and cap, category sums equal passed + failed, the 14-day window ending today, recent rows newest-first and capped at five, a fresh submission counted immediately, a live attempt moving no average, a timed-out attempt settled with `autoSubmitted`, scoping between two students, 403/401, and an empty student (`null`s, not zeroes) |
| `apps/web` (143)        | 17 — every presentation helper, including missing-value labels, delta wording, bar widths for an empty and a single-category payload                                                                                                                                                                                                                                                                                  |
| e2e smoke               | 2 checks — the six statistics over HTTP with their invariants (counts add up, ranges hold, trend chronological, 14 buckets, recent non-empty), and the 401/403 plus cross-student scoping                                                                                                                                                                                                                             |

`bun run test:e2e` runs against a throwaway `file:` database migrated and seeded by the real
toolchain; the cloud database is never touched.
