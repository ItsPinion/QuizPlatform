# Quiz management (Day 5)

Day 4 filled the console with read-only visibility. Day 5 makes the content itself
editable: create a quiz, change it, retire it, and decide when students can see it.

Everything is mounted at `/api/admin/quizzes`, so the `requireAdmin` guard on the parent
router (Day 3) runs before any of these handlers. The screens live at `/admin/quizzes`,
`/admin/quizzes/new` and `/admin/quizzes/:id`.

> The spec lists `POST /api/quizzes`, `PUT /api/quizzes/:id` and `PATCH
/api/quizzes/:id/publish`. This build keeps every admin mutation inside the guarded
> `/api/admin` namespace instead, and uses `PATCH`/`DELETE` for the REST methods. The
> student-facing read side arrives on Day 7 under `/api/student/*`.

---

## Endpoints

| Method   | Path                               | Purpose                                    |
| -------- | ---------------------------------- | ------------------------------------------ |
| `GET`    | `/api/admin/quizzes`               | Paged, filtered, sorted quiz directory     |
| `POST`   | `/api/admin/quizzes`               | Create a quiz — always `DRAFT`             |
| `GET`    | `/api/admin/quizzes/:id`           | One quiz with question and attempt counts  |
| `PATCH`  | `/api/admin/quizzes/:id`           | Edit content and settings                  |
| `DELETE` | `/api/admin/quizzes/:id`           | Delete a quiz that has no attempts         |
| `POST`   | `/api/admin/quizzes/:id/publish`   | Publish — needs at least one question      |
| `POST`   | `/api/admin/quizzes/:id/unpublish` | Take a published quiz offline              |
| `GET`    | `/api/admin/categories`            | Category list + quiz counts (for the form) |
| `POST`   | `/api/admin/categories`            | Find-or-create a category by name          |

`POST /api/admin/categories` is idempotent: `201 { created: true }` for a brand-new name,
`200 { created: false }` when it already exists under any casing. Day 6 adds rename and
delete.

---

## Directory

| Query        | Values                                         | Default  |
| ------------ | ---------------------------------------------- | -------- |
| `search`     | title substring (case-insensitive `LIKE`)      | —        |
| `status`     | `DRAFT` \| `PUBLISHED` \| `UNPUBLISHED`        | —        |
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD`                   | —        |
| `categoryId` | category uuid                                  | —        |
| `sort`       | `newest` \| `oldest` \| `title` \| `questions` | `newest` |
| `page`       | integer ≥ 1                                    | `1`      |
| `pageSize`   | integer 1–50                                   | `10`     |

Each row carries `questionCount` and `attemptCount` from **two joins**, so both are
`count(distinct …)` — without the `distinct`, 4 questions × 3 attempts would report 12 of
each. A test asserts the reported question count equals the rows actually in the table.

Cleared filters (`?status=&search=`) arrive as empty strings and are treated as absent,
because that is exactly what the HTML form submits when you click **Clear**.

---

## Creating and editing

```http
POST /api/admin/quizzes
Content-Type: application/json

{
  "title": "JavaScript Fundamentals",
  "description": "Syntax, arrays and async.",
  "categoryName": "JavaScript",
  "difficulty": "MEDIUM",
  "durationMinutes": 20,
  "passingScore": 60,
  "maxAttempts": 2,
  "thumbnailUrl": "https://…"
}
```

- `title` 3–160, `description` ≤ 2000 (blank → `null`), `durationMinutes` 1–180,
  `passingScore` 0–100, `maxAttempts` 1–10, `thumbnailUrl` a URL or blank.
- Numbers are coerced, so both a JSON body and a form-encoded `"20"` validate the same.
- `categoryName` (or a `categoryId`) picks the category — see [Categories](#categories).
- **Status is not an input.** A new quiz is a `DRAFT`; going live is a separate action.

### Categories

Categories are **data, not an enum**, so the form is not a dropdown: it is a typeahead.
You either pick a suggestion or type a name that does not exist yet, and the server decides
which of the two you meant.

```
POST /api/admin/quizzes   { "categoryName": "javascript" }   → reuses "JavaScript"
POST /api/admin/quizzes   { "categoryName": "Rust" }         → creates it, then uses it
```

The rule is one line, and it lives in `packages/shared/src/quiz.ts` so the UI can run the
same comparison before a round-trip:

```ts
normalizeCategoryName('  Advanced   JavaScript '); // → 'advanced javascript'
findCategoryByName('javascript', categories); // → the existing row, or undefined
```

1. `trim()`, collapse internal whitespace, `toLowerCase()`.
2. Compare against every existing category's normalized name.
3. Match → reuse that row. No match → insert a new one (slug from `uniqueSlug`).

The display name keeps the casing you typed; only the _comparison_ is lowercased. A
database-level `unique index on lower(name)` backs the rule, so two admins creating
"Rust" at the same instant cannot both win: the loser catches the unique violation and
re-selects the winner's row instead of returning a 500.

A quiz takes **exactly one** of the two forms:

| Body                       | Result                                           |
| -------------------------- | ------------------------------------------------ |
| `{ categoryName: "Rust" }` | resolved (reuse or create), `201`                |
| `{ categoryId: "<uuid>" }` | used as-is, `422 CATEGORY_NOT_FOUND` if unknown  |
| both                       | `422` — "Send either categoryId or categoryName" |
| neither                    | `422` — "Choose a category or type a new one"    |

`categoryId` stays supported for callers that already hold an id (and for the seeded
data path); the browser form always sends the name, because the name is what the admin
actually knows.

`PATCH` accepts `categoryName` on the same terms and only writes `category_id` when the
resolved row actually differs from the current one — so editing a title no longer touches
the category column at all.

In the browser, `components/category-combobox.tsx` ranks suggestions
(`rankCategories()` in `lib/quiz-params.ts`: exact → prefix → substring, alphabetical
ties, capped at 8) and shows each one's quiz count. It keeps the typed text when nothing
matches, and labels the pending state honestly:

```
JavaScript            12 quizzes     ← existing, will be reused
Rust                  new category   ← will be created on save
```

Keyboard navigation is `↑` `↓` `Enter` `Esc`; clicking away keeps whatever was typed.

### Slugs

The client never sends a slug. The server derives it:

```
"  Kubernetes Basics — Part 1!  "  →  kubernetes-basics-part-1
```

Accents are stripped, punctuation collapses to single dashes, and a collision gets a
numeric suffix (`…-2`, `…-3`). `uniqueSlug()` ignores the quiz being edited, so it can
never collide with itself.

The slug is **stable**: renaming a quiz does not change it, because a slug may already be in
a link someone holds. `PATCH { title }` therefore updates the title and leaves the slug.

### Partial updates

`PATCH` accepts any subset and rejects `{}` with `422` ("Provide at least one field to
update"). The update schema deliberately declares its fields **without the create-time
defaults**: a partial object must not silently reset a 45-minute duration back to 20 just
because the key was absent. There is a test for exactly that.

---

## Lifecycle

```
DRAFT ──publish──▶ PUBLISHED ──unpublish──▶ UNPUBLISHED
  ▲                    │                          │
  └──── edit ──────────┴───────publish───────────┘
```

| Action                            | Result                                   |
| --------------------------------- | ---------------------------------------- |
| publish a draft with questions    | `200`, status `PUBLISHED`                |
| publish a draft with no questions | `409 QUIZ_HAS_NO_QUESTIONS`              |
| publish an already-published quiz | `200` — idempotent, intent already holds |
| unpublish a published quiz        | `200`, status `UNPUBLISHED`              |
| unpublish a draft or unpublished  | `409 QUIZ_NOT_PUBLISHED`                 |

Publishing is idempotent because the caller's intent is "be published" and it already
holds. Unpublishing something that was never live is a _state_ error — silently succeeding
would hide a mistake. Neither is a `403`: the caller may do this; the state says no.

Publish and unpublish are their own endpoints rather than a `status` field on `PATCH`, so
the rules cannot be bypassed by an ordinary content edit.

### Deleting

```
DELETE /api/admin/quizzes/:id   → 200 { "success": true, "id": "…" }
DELETE (with attempts)          → 409 QUIZ_HAS_ATTEMPTS
```

Deleting cascades to questions, options, answers and attempts. Once a student has
attempted the quiz, those rows are history: the API refuses and suggests unpublishing
instead. A quiz with zero attempts deletes cleanly, and its questions go with it.

The rule is enforced in the API and mirrored in the UI (`canDelete` in
`packages/shared/src/quiz.ts`) so the button is disabled with the reason instead of
failing after a click.

---

## Screens

| Route                | What it does                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/quizzes`     | Server-rendered directory: filters in the URL, pagination, status and difficulty badges, question/attempt counts, "Manage" link |
| `/admin/quizzes/new` | Create form (client) → `POST` → lands on the new quiz's edit screen                                                             |
| `/admin/quizzes/:id` | Edit form + lifecycle card (publish/unpublish, two-step delete) + record panel                                                  |

Both the list and the form are guarded by `decideAccess(session, 'ADMIN', <path>)` on the
server, and every mutation goes through `hc<AppType>` so the payload and response shapes
are checked at compile time.

The form is one component in two modes: the fields, defaults and error messages are
identical, only the HTTP method and destination differ. API validation messages surface
verbatim, so the UI can never invent a rule the server does not enforce.

### Failure states

| Situation                        | What the screen does                                      |
| -------------------------------- | --------------------------------------------------------- |
| API or database unavailable      | "could not be loaded" card with the `/api/health/db` hint |
| No quizzes match the filters     | Empty state suggesting clearing them                      |
| Publish blocked (no questions)   | Button disabled, reason printed under it                  |
| Delete blocked (attempts exist)  | Button disabled, "n attempts — unpublish instead"         |
| API rejects a mutation (409/422) | The API's message in an inline alert                      |
| Unknown quiz id                  | Next.js `notFound()` → 404                                |

---

## Tests

| Layer  | File                                           | Covers                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API    | `apps/api/src/__tests__/admin-quizzes.test.ts` | 44 tests: directory filters/sorts/paging, aggregates, create defaults + slug collisions, category resolution (reuse, create, casing, whitespace, XOR), validation, partial updates, full lifecycle, delete rules, 401/403 |
| Shared | `packages/shared/src/quiz.test.ts`             | 35 tests: slugify/uniqueSlug, create defaults, update-without-defaults, enums, lifecycle helpers, category name normalization/matching                                                                                    |
| Web    | `apps/web/src/lib/quiz-params.test.ts`         | 25 tests: filter parsing, query/href round-trips, duration formatting, badge tones, blocked-action hints, category ranking                                                                                                |
| E2E    | `scripts/e2e-smoke.ts`                         | 11 Day-5 checks over real HTTP: categories, case-insensitive reuse, quiz-by-name, aggregates, create, edit, publish/publish-blocked, lifecycle, delete rules, 403                                                         |

```bash
bun run test        # 364 Vitest tests
bun run test:e2e    # 36 checks against a live API + throwaway database
```
