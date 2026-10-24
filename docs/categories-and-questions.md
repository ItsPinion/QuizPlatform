# Categories & questions (Day 6)

Day 5 could create a quiz but not fill it. Day 6 gives the console the two things that
make a quiz a quiz: **categories** with a real CRUD screen, and **questions** with
options, marks, difficulty and a key. The key is one option for multiple choice and
true/false, several for multiple answers, and the accepted-answer list for fill in the
blank — the four formats are specified in
[`advanced-features.md`](advanced-features.md) §10 and summarised below.

Two ideas run through the whole day:

1. **A question is a set, not a row.** An options array plus the index of the right one
   is validated together, so "zero correct answers" and "two correct answers" are not
   states the database can hold.
2. **Student history outranks admin convenience.** A question that has been answered
   cannot be deleted, and an option a student picked cannot be removed. Editing is still
   allowed — it updates rows in place.

Everything is mounted inside the guarded `/api/admin` namespace, so `requireAdmin`
(Day 3) runs before any handler below. Screens live at `/admin/categories` and on a
quiz's edit page.

---

## Categories

| Method   | Path                        | Purpose                                        |
| -------- | --------------------------- | ---------------------------------------------- |
| `GET`    | `/api/admin/categories`     | Every category with its quiz count             |
| `POST`   | `/api/admin/categories`     | Create, or return the matching one (201 / 200) |
| `GET`    | `/api/admin/categories/:id` | One category plus the quizzes filed under it   |
| `PATCH`  | `/api/admin/categories/:id` | Rename and/or re-describe                      |
| `DELETE` | `/api/admin/categories/:id` | Delete — only when nothing is filed under it   |

### Create is find-or-create

```
POST { "name": "react" }     → 200 { category: { name: "React", … }, created: false }
POST { "name": "Rust" }      → 201 { category: { name: "Rust",  … }, created: true  }
```

Matching is `trim` → collapse whitespace → `toLowerCase`, shared with the quiz form's
typeahead (`normalizeCategoryName` / `findCategoryByName` in `packages/shared/src/quiz.ts`).
The stored display name keeps the casing that was typed. A database-level
`unique index on lower(name)` makes the rule enforceable when two admins submit the same
new name at the same instant — the loser catches the unique violation and adopts the
winner's row instead of returning a 500.

### Renaming keeps the slug

```
PATCH { "name": "Data Science" }   → 200, slug still "data"
```

The slug is derived once, on creation, and never changes afterwards — the same contract
quizzes follow, for the same reason: it may already be in a link.

Renaming to a name another category answers to is `409 CATEGORY_EXISTS`, whatever the
casing:

| Body                                                    | Result                          |
| ------------------------------------------------------- | ------------------------------- |
| `{ "name": "React" }` where another category is `react` | `409 CATEGORY_EXISTS`           |
| `{ "name": "REACT" }` on the category named `React`     | `200` — it is the same category |
| `{ "description": "" }`                                 | `200` — stored as `null`        |
| `{}`                                                    | `422` — nothing to update       |

### Deleting is restricted, not cascading

```
DELETE /api/admin/categories/:id              → 200 { "success": true, "id": "…" }
DELETE (with 3 quizzes filed under it)        → 409 CATEGORY_HAS_QUIZZES
```

`quizzes.category_id` is `onDelete: 'restrict'`, so the rule is the database's, not just
the handler's. The message names the count and says "move or delete them first": removing
labels must never quietly remove content. `canDeleteCategory()` in the shared package lets
the UI disable the button with the same explanation.

### Screens

| Route                | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `/admin/categories`  | Server-rendered table: name, slug, description, quiz count, inline rename and delete |
| `/admin/quizzes/:id` | The category field is a typeahead — pick an existing one or type a new one           |

Both are guarded by `decideAccess(session, 'ADMIN', …)`; every mutation goes through
`hc<AppType>`. The table links a category's quiz count to `/admin/quizzes?categoryId=…`,
which is the "view quizzes under category" view from the spec.

---

## Questions

| Method   | Path                                     | Purpose                                      |
| -------- | ---------------------------------------- | -------------------------------------------- |
| `GET`    | `/api/admin/quizzes/:id/questions`       | A quiz's questions, ordered, with options    |
| `POST`   | `/api/admin/quizzes/:id/questions`       | Append a question in any format              |
| `PATCH`  | `/api/admin/quizzes/:id/questions/order` | Reorder the whole list                       |
| `GET`    | `/api/admin/questions/:id`               | One question                                 |
| `PUT`    | `/api/admin/questions/:id`               | Replace text, marks and the whole option set |
| `DELETE` | `/api/admin/questions/:id`               | Delete — unless it has answers               |

### The shape

```json
{
  "questionText": "Which method converts a JSON string into an object?",
  "explanation": "JSON.stringify() goes the other way.",
  "marks": 2,
  "difficulty": "EASY",
  "options": [
    { "text": "JSON.stringify()" },
    { "text": "JSON.parse()" },
    { "text": "JSON.convert()" }
  ],
  "correctIndex": 1
}
```

`correctIndex` — not an option id — because the correct answer is a property of the set.
The schema (`packages/shared/src/question.ts`) enforces:

| Rule                                            | Failure |
| ----------------------------------------------- | ------- |
| question text 5–2000 characters                 | `422`   |
| 2–6 options, each 1–1000 characters             | `422`   |
| options must differ (case-insensitive, trimmed) | `422`   |
| `correctIndex` inside the option set            | `422`   |
| marks 1–10, whole numbers                       | `422`   |
| difficulty `EASY` / `MEDIUM` / `HARD`           | `422`   |

### The other three formats

`type` defaults to `MCQ`, so the payload above is still a valid single-answer question. The
rest change what the key means rather than what an option is:

| `type`       | Body                                                    | Extra rule                                    |
| ------------ | ------------------------------------------------------- | --------------------------------------------- |
| `MCQ`        | `options` + `correctIndex`                              | exactly one key                               |
| `MULTI`      | `options` + `correctIndexes: [0, 2]`                    | at least two, no duplicates, in range         |
| `TRUE_FALSE` | `correctIndex: 0` (`True`) or `1` (`False`), no options | the server writes the pair                    |
| `FILL_BLANK` | `options` = the accepted spellings, no `correctIndex`   | at least one; every listed answer is accepted |

Any format may also carry `imageUrl` (a full `https://` URL) and `codeSnippet` (up to 4000
characters); both render above the options and neither affects grading. A question's type is
fixed after creation: changing it would reinterpret every answer already recorded against the
row.

A new question is appended with `position = max + 1`, so authoring matches the order
things were written.

### `PUT`, not `PATCH`

Editing replaces the question wholesale. A partial update could remove the option the
`correctIndex` points at while leaving the index alone — a question nobody could pass. The
endpoint therefore takes the same body as `POST` and rewrites the set atomically.

**Options are reconciled by id**, which is what keeps past answers meaningful:

| Sent option    | What happens                                          |
| -------------- | ----------------------------------------------------- |
| `{ id, text }` | row updated in place — same id every answer points at |
| `{ text }`     | new row inserted                                      |
| omitted        | row deleted, **unless** a student picked it           |

Deleting an option that appears in `answers.selected_option_id` answers
`409 OPTION_HAS_ANSWERS` and writes nothing. Sending an id that belongs to a different
question answers `422 OPTION_NOT_FOUND`.

### Deleting

```
DELETE /api/admin/questions/:id                → 200 { "success": true, "id": "…" }
DELETE (the question has answers)              → 409 QUESTION_HAS_ANSWERS
DELETE (last question of a PUBLISHED quiz)     → 409 QUIZ_WOULD_HAVE_NO_QUESTIONS
```

The second rule exists because Day 5 already refuses to publish an empty quiz: a live quiz
must never be left with nothing to ask. The message says what to do — unpublish first, or
add another question. Deleting a draft's last question is fine.

After any delete the remaining positions are compacted back to `0..n-1`.

### Ordering

```
PATCH /api/admin/quizzes/:id/questions/order
{ "ids": ["<third>", "<first>", "<second>"] }
```

The client sends the complete new order; the server rejects anything that is not an exact
permutation of that quiz's questions with `422 QUESTION_ORDER_MISMATCH`. A partial list
would leave the positions of the omitted questions ambiguous. Positions are then rewritten
as `0, 1, 2 …`, so the sequence students see is exactly the one the admin saved.

### Screens

The quiz edit page carries the whole authoring surface:

- Question list with position, difficulty badge, marks and option count.
- Expand a question to see its options, with the correct one highlighted and the
  explanation underneath.
- **Add question** opens an inline form: the format picker first, then the fields that format
  needs — option rows with a radio for the key (add/remove, 2–6) or checkboxes for a
  multiple-answer question, a true/false switch, or the accepted-answer list for a fill in the
  blank — plus an optional image URL, code snippet, marks, difficulty and explanation.
- **Edit** reuses the same form with option ids preserved; **↑ / ↓** reorder; **Delete**
  is a two-step confirm and is disabled when students have answered.

Failure states:

| Situation                         | What the screen does                               |
| --------------------------------- | -------------------------------------------------- |
| API unreachable                   | "This quiz could not be loaded" card with the hint |
| Question has answers              | Delete disabled, "n recorded answers" printed      |
| Last question of a published quiz | Delete disabled, "unpublish the quiz first"        |
| API rejects a write (409/422)     | The API's message verbatim in an inline alert      |
| Unknown question id               | `404 QUESTION_NOT_FOUND`                           |

---

## Tests

| Layer  | File                                              | Covers                                                                                                                                                                     |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared | `packages/shared/src/question.test.ts`            | option limits, duplicate detection, correct-index bounds, marks, defaults, ordering schema, the three authoring rules                                                      |
| Shared | `packages/shared/src/quiz.test.ts`                | category edit schema (empty body, blank description → `null`), `canDeleteCategory`                                                                                         |
| API    | `apps/api/src/__tests__/admin-categories.test.ts` | list/detail, create + idempotent create, rename (slug stable, re-casing, `409 CATEGORY_EXISTS`), description set/clear, delete blocked by quizzes, 401/403                 |
| API    | `apps/api/src/__tests__/admin-questions.test.ts`  | ordered reads, append, the validation matrix, option reconciliation by id, `OPTION_HAS_ANSWERS`, `OPTION_NOT_FOUND`, delete rules, order permutations, publish integration |
| Web    | `apps/web/src/lib/question-params.test.ts`        | form ↔ payload round-trip, blank-row compaction, validation messages, `moveItem`, summaries, badge tones                                                                   |
| DB     | `packages/db/src/__tests__/schema.test.ts`        | the `lower(name)` unique index on categories                                                                                                                               |
| E2E    | `scripts/e2e-smoke.ts`                            | 10 Day-6 checks over real HTTP: category create/rename, delete rules, authoring, validation, reorder, `PUT`, publish, last-question rule                                   |

```bash
bun run test        # 430 Vitest tests
bun run test:e2e    # 46 checks against a live API + throwaway database
```

---

## Known trade-offs

- **Editing a question is allowed even when it has answers.** Past attempts keep their own
  `answers.is_correct` snapshot, so historical scores do not change; only the wording of
  the question moves. Deleting is what would leave a result pointing at nothing, which is
  why that is the blocked operation.
- **There is no question import yet.** The spec's §"Question Import" (CSV/JSON) is a later
  enhancement; today questions are authored one at a time.
- **Ordering is manual.** No randomisation is applied here — that belongs to the attempt
  system on Day 7, where the spec calls for per-attempt shuffling.
