# Admin analytics (Day 11)

```
GET /api/admin/analytics?days=30   → students, quizzes, attempts, timeline, popularity
/admin/analytics                   → the console screen
```

Spec §5 asks the admin dashboard to chart **quiz attempts over time, student registrations, average
quiz scores, the pass/fail ratio, the most popular quizzes and the most popular categories**, and the
Day 11 milestone asks for the student, quiz and attempt statistics behind them. All of it is one
request with one window.

---

## 1. The payload

`adminAnalyticsSchema` in `packages/shared/src/analytics.ts`:

```ts
type AdminAnalytics = {
  generatedAt: string;
  windowDays: 7 | 14 | 30 | 90;

  students: { total; active; inactive; newInWindow; newInPreviousWindow;
              activeLearners; attemptsPerLearner | null };
  quizzes:  { total; published; drafts; unpublished; questions;
              attempted; neverAttempted; averageQuestions | null };
  attempts: { total; graded; passed; failed; expired; inProgress;
              averagePercentage | null; passRate | null; averageTimeSeconds | null;
              questionsAnswered; accuracy | null; inWindow; inPreviousWindow };

  timeline: { date; label; attempts; registrations; passed; failed;
              averagePercentage | null }[];          // window length, oldest → newest

  quizPerformance: { quizId; title; slug; categoryName; status;
                     attempts; learners; averagePercentage | null; bestPercentage | null;
                     passRate | null; lastAttemptAt | null }[];   // by attempts, desc

  categories: { categoryId; name; quizzes; attempts; learners;
                averagePercentage | null; passRate | null }[];    // by attempts, desc
};
```

`?days=` accepts `7`, `14`, `30` (default) or `90`. Anything else is `422 VALIDATION_ERROR`; an empty
`?days=` is a cleared filter and means the default. The route is inside the admin namespace, so the
`requireAdmin` guard answers `401` anonymously and `403` for a student before the handler runs.

---

## 2. Definitions

| Figure                          | Rule                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graded`                        | `PASSED + FAILED`. `EXPIRED` is tracked separately: nobody submitted that paper, so counting it as a failure would overstate the failure rate (grading itself only ever writes PASSED or FAILED, so the slice is normally empty). |
| `passRate`                      | `passed / (passed + failed)`, `null` before the first result.                                                                                                                                                                     |
| `averagePercentage`             | Mean over graded attempts. An `IN_PROGRESS` row stores a `0` nobody earned, so it is excluded from every average and rate.                                                                                                        |
| `timeline.attempts`             | Attempts **started** that UTC day (`strftime` on `started_at`), zero-filled across the window.                                                                                                                                    |
| `timeline.registrations`        | STUDENT accounts created that UTC day (`users.created_at`).                                                                                                                                                                       |
| `timeline.passed/failed`        | That day's finished papers, in the same bucket.                                                                                                                                                                                   |
| `inWindow` / `inPreviousWindow` | Attempts started in the selected window, and in the window of the same length immediately before it.                                                                                                                              |
| `activeLearners`                | Distinct students with at least one attempt, ever.                                                                                                                                                                                |
| `attemptsPerLearner`            | `total attempts / activeLearners`, one decimal, `null` with no learners.                                                                                                                                                          |
| `quizzes.attempted`             | Distinct quizzes with at least one attempt; `neverAttempted` is the rest.                                                                                                                                                         |
| `quizPerformance`               | Only attempted quizzes. `learners` is distinct students; `popular` means attempts, because a quiz people retry is genuinely popular.                                                                                              |
| `categories`                    | Every category, including the ones nobody has touched (an empty bar is information). `quizzes` counts drafts too.                                                                                                                 |
| `accuracy`                      | `questionsCorrect / questionsAnswered`; a blank question is not an answer.                                                                                                                                                        |

### The cross-user expiry sweep

The student screens sweep timed-out attempts lazily, but only for the caller. An admin looking at the
whole platform would otherwise see "in progress" papers whose deadline passed hours ago — inflating
`inProgress` and hiding a finished attempt from `passed`/`failed`. `buildAdminAnalytics` therefore
runs `settleStaleAttempts()` first: it finds the owners of stale rows (up to fifty) and settles each
through the same Day 8 grading path, `autoSubmitted` included. It is the one place in the product
that expires another user's attempt, and it does so through the normal grader rather than by writing
a status directly.

---

## 3. The queries

Fourteen aggregates, issued in parallel (`apps/api/src/lib/admin-analytics.ts`):

| #   | Query                                                         | Feeds                                                                 |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | students by status + `created_at` buckets                     | `students.*`                                                          |
| 2   | quizzes by status                                             | `quizzes.total/published/drafts/unpublished`                          |
| 3   | questions count                                               | `quizzes.questions`                                                   |
| 4   | attempts by status + distinct users/quizzes + graded averages | `attempts.*`, `activeLearners`                                        |
| 5–6 | attempts in the window, and in the previous window            | `inWindow`, `inPreviousWindow`                                        |
| 7   | attempts grouped by `started_at` day                          | `timeline.attempts/passed/failed/average`                             |
| 8   | students grouped by `created_at` day                          | `timeline.registrations`                                              |
| 9   | attempts ⋈ quizzes ⋈ categories grouped by quiz               | `quizPerformance`                                                     |
| 10  | attempts ⋈ quizzes ⋈ categories grouped by category           | `categories` attempt columns                                          |
| 11  | categories ⟕ quizzes grouped by category                      | `categories.quizzes` (+ the name, so quiet categories still have one) |

The registration series is merged onto the attempt buckets in JavaScript — two `GROUP BY` shapes, one
date grid — instead of a `UNION` that would need a synthetic label column. Day 11 adds no table, no
column and no migration.

---

## 4. Charts

All geometry is in `packages/shared/src/analytics.ts` and unit-tested; the components are server
components, so none of this ships JavaScript:

- **Attempts over time** (`analytics-timeline.tsx`) — bars for attempts per day, scaled by
  `barScale()` (relative to the busiest day), plus a line for registrations on its own scale via
  `seriesPoints()` / `seriesPath()`. Each bar carries a `<title>` with the day, attempts,
  registrations and that day's average — a single string, since a `<title>` cannot hold mixed
  children.
- **Pass/fail** (`pass-fail-chart.tsx`) — one stacked bar from `ratioSlices()`, which rounds the
  slices so they add up to exactly 100 and puts expired attempts in their own tone. The legend
  carries the counts; the caption states the denominator.
- **Most popular quizzes** (`quiz-performance-chart.tsx`) — the top six by attempts, each with the
  average score as a 0–100 bar, the attempts/learners caption, the pass rate and its category. Rows
  link to the quiz editor.
- **Most popular categories** (`category-popularity.tsx`) — bars scaled to the busiest category (with
  an empty bar kept for untouched ones), plus quizzes, attempts and the average score.

Window chips (`7d` / `14d` / `30d` / `90d`) are plain links: the window lives in the URL, so a reload
reproduces the view and the page stays a server component. Missing values print `—`, never `0%`.

---

## 5. Verification

| Suite                   | What Day 11 added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` (214) | 32 — window parsing and its fallbacks, zero-filled buckets and their labels, window totals and the busiest day, ratio slices (expired separate, percentages summing to 100, empty and negative input), share/bar scaling, series points (zero series, single point, empty), percent change, and the query + payload schemas                                                                                                                                                                                                                                               |
| `apps/api` (248)        | 12 — every aggregate checked against direct queries, the status buckets adding up, ranges and `null`s, the timeline's length/order/today anchor and its sum matching `inWindow`, all four windows plus `422` for `365`, quiz rows summing to the attempts and ordered by popularity, categories covering every row (including quiet ones) with their quiz counts, a new attempt appearing immediately, a live attempt moving no average, a timed-out attempt settled before counting, registrations in today's bucket, the previous window kept separate, and `401`/`403` |
| `apps/web` (159)        | 16 — window parsing and href round-trips, change wording and tones, outcome labels and tones, popularity and category captions, score-bar clamping, pass-rate captions and the timeline's screen-reader summary                                                                                                                                                                                                                                                                                                                                                           |
| e2e smoke               | 2 checks — the platform payload over HTTP with its invariants (buckets add up, timeline totals match, rows sum to attempts), and the window validation plus the two refusals                                                                                                                                                                                                                                                                                                                                                                                              |

`bun run test:e2e` runs against a throwaway `file:` database migrated and seeded by the real
toolchain; the cloud database is never touched.
