# Leaderboard (Day 12)

```
GET /api/leaderboard?metric=average|best|completed&period=all|month|week&categoryId=…&limit=20
/student/leaderboard
```

Spec §19 asks for a ranking system with an **overall** and a **category-wise** board, ranked on
**highest score, average score and number of quizzes completed**, and for weekly and monthly variants.
That is one endpoint with three independent controls, and one screen that keeps all three in the URL.

---

## 1. The payload

`leaderboardResponseSchema` in `packages/shared/src/leaderboard.ts`:

```ts
type LeaderboardResponse = {
  generatedAt: string;
  metric: 'average' | 'best' | 'completed';
  period: 'all' | 'month' | 'week';
  scope: { type: 'overall' | 'category'; categoryId: string | null; categoryName: string | null };

  entries: {
    rank; userId; name;
    averagePercentage; bestPercentage;
    attempts; quizzesCompleted; passed; failed; passRate | null;
    lastAttemptAt | null;
    isCurrentUser;      // the caller's row, wherever it is in the slice
    gapToNext;          // points (or quizzes) behind the row above
  }[];

  currentUser: entry | null;   // always resolved, even off-page
  totals: { participants; attempts; quizzes };
};
```

| Query        | Default       | Notes                                                                              |
| ------------ | ------------- | ---------------------------------------------------------------------------------- |
| `metric`     | `average`     | `best` ranks on the highest single score, `completed` on distinct quizzes finished |
| `period`     | `all`         | `month` = last 30 days, `week` = last 7, measured on `completed_at`                |
| `categoryId` | —             | scopes the board to one category; unknown id → `404 CATEGORY_NOT_FOUND`            |
| `limit`      | `20` (max 50) | the visible slice; `currentUser` is resolved against the whole board               |

Auth is `requireAuth` at the router level: both roles may read the board (`401` anonymously), and no
email address is ever in the payload — a name and a rank are all a leaderboard needs.

---

## 2. Who is on the board

Only **graded** attempts (`PASSED` / `FAILED`) are aggregated, for `STUDENT` users:

| Column                           | Rule                                                |
| -------------------------------- | --------------------------------------------------- |
| `averagePercentage`              | mean of that student's graded percentages, in scope |
| `bestPercentage`                 | their highest graded percentage, in scope           |
| `attempts`                       | graded attempts, in scope                           |
| `quizzesCompleted`               | distinct quizzes with a graded attempt, in scope    |
| `passed` / `failed` / `passRate` | counts and `passed / (passed + failed)`             |
| `lastAttemptAt`                  | the most recent `completed_at`                      |

An `IN_PROGRESS` paper is invisible here — it has no score, so it cannot rank, and including it would
put a student at the bottom of a board they have not finished playing on. That also means the
endpoint needs no expiry sweep: an unsettled timed-out attempt is simply not graded yet, exactly like
a live one.

---

## 3. Ranking rules

Ranking is a pure function (`buildLeaderboard`) rather than a SQL window function, because the rules
are the product:

1. **Sort** by the chosen metric, then by average, then by best score, then by quizzes completed, then
   alphabetically. The tie-breakers only make the order deterministic — the same board on every call.
2. **Competition ranking**: students with the same metric value share a rank, and the next place skips
   the numbers the tie consumed — `1, 2, 2, 4`. Ties are judged on the metric alone.
3. **`gapToNext`** is how far a row sits behind the one printed above it, in the metric's own units —
   percentage points for `average`/`best`, quiz counts for `completed`. The leader and tied rows get
   `0`, which the UI renders as `—` and `Tied` respectively.
4. **`isCurrentUser`** marks the caller's row and `currentUser` returns it even when it falls outside
   `limit`, so "your position" never depends on the page size.

Rolling periods are deliberate: "this week" is the last 7 days on every day of the week, rather than a
calendar week that clears itself every Monday morning.

---

## 4. The screen

`/student/leaderboard` (also a live item in the student nav):

- three **metric** chips and three **period** chips, plus a **category** row built from the same
  catalogue call the quiz list uses;
- **Your position** — rank, metric value, finished attempts, quizzes completed and pass rate, with
  `2nd of 4 · top 50%` as the caption; when the caller has no graded attempt, the card invites them to
  take one instead of printing a fake rank;
- a **podium** for the top three, then the full ranked `<table>` (rank + ordinal, student, the metric
  value, attempts, pass rate, gap) with the caller's row tinted and badged **You**;
- a "how ranking works" card stating the three rules in plain language.

Every control is a link, so the board is shareable, cacheable and server-rendered — no client state to
get out of sync. Unknown query values fall back to the defaults in the page's parser while the API
stays strict (`422` for `?metric=streak`, `?period=year`, `?limit=0|500`, a malformed `categoryId`).

---

## 5. Verification

| Suite                   | What Day 12 added                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` (238) | 24 — metric values, sorting by each metric with its tie-breakers, competition ranks and gaps (including quiz units), `buildLeaderboard` (current-user marking, pass rates, empty board), period starts, `topPercentOf`, and the query/payload schemas                                                                                                                                                                                                                           |
| `apps/api` (260)        | 12 — the overall board checked against each student's own aggregates, sorted and ranged, emails absent, the caller's row and rank beyond the slice, best/completed boards, a controlled tie fixture (two 88s share rank 1, next is rank 3, gap 18), category scope and its `404`, rolling week/month windows bounded on `completed_at`, in-progress attempts invisible, a new graded attempt counted immediately, the validation matrix, and 401/403-free access for both roles |
| `apps/web` (177)        | 18 — filter parsing and fallbacks, API query building, href round-trips that keep the other controls, metric/period/scope/participant labels, ordinals (`11th`, `21st`), podium tones, gap wording (`Tied`, `5 pts behind`, `1 quiz behind`), the current-user caption and the board's screen-reader summary                                                                                                                                                                    |
| e2e smoke               | 2 checks — the ranked board over HTTP with its invariants (sorted, ranks monotonic, counts consistent, no email leak), and metric/period/category handling plus `422`/`404`/`401`                                                                                                                                                                                                                                                                                               |

Board-changing tests insert their own attempts (and one throwaway category + quiz for the tie case),
then delete them in `afterAll`, so the shared fixture database is left as it was found.
