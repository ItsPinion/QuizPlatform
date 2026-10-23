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

`/api/admin/categories` is read-only today; Day 6 adds the mutations.

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
  "categoryId": "…",
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
- `categoryId` must exist → `422 CATEGORY_NOT_FOUND` (a foreign-key error would be a 500).
- **Status is not an input.** A new quiz is a `DRAFT`; going live is a separate action.

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

| Layer  | File                                           | Covers                                                                                                                                                      |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API    | `apps/api/src/__tests__/admin-quizzes.test.ts` | 36 tests: directory filters/sorts/paging, aggregates, create defaults + slug collisions, validation, partial updates, full lifecycle, delete rules, 401/403 |
| Shared | `packages/shared/src/quiz.test.ts`             | 25 tests: slugify/uniqueSlug, create defaults, update-without-defaults, enums, lifecycle helpers                                                            |
| Web    | `apps/web/src/lib/quiz-params.test.ts`         | 19 tests: filter parsing, query/href round-trips, duration formatting, badge tones, blocked-action hints                                                    |
| E2E    | `scripts/e2e-smoke.ts`                         | 9 Day-5 checks over real HTTP: categories, aggregates, create, edit, publish/publish-blocked, lifecycle, delete rules, 403                                  |

```bash
bun run test        # 338 Vitest tests
bun run test:e2e    # 34 checks against a live API + throwaway database
```
