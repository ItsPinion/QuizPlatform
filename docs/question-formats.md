# Question formats

The specification's §10 lists six "future enhancement" question types after the
one the first version must support. Four of them are grading shapes and all four
are built; the other two are a way of _showing_ a question rather than a way of
marking one, and they are columns on every format.

This page is the manual: what each format means, what the database stores, what
the API accepts, how the grader decides, what the two consoles show, how a
spreadsheet imports, and what the tests prove. The **decision** to leave "match
the following" out — and the argument for it — is in
[`advanced-features.md`](advanced-features.md) §10.

| Brief's item (§10)       | Type         | Stored as                                  | Graded by                                |
| ------------------------ | ------------ | ------------------------------------------ | ---------------------------------------- |
| multiple choice          | `MCQ`        | 2–6 options, exactly one with `is_correct` | the chosen option is the keyed one       |
| multiple correct answers | `MULTI`      | 2–6 options, two or more with `is_correct` | the chosen **set** equals the key set    |
| true / false             | `TRUE_FALSE` | the fixed pair `True` / `False`, one keyed | the chosen option is the keyed one       |
| fill in the blanks       | `FILL_BLANK` | accepted answers, **all** of them keyed    | typed text, compared after normalisation |
| image-based questions    | _any type_   | `questions.image_url`                      | same as the type it decorates            |
| code-based questions     | _any type_   | `questions.code_snippet`                   | same as the type it decorates            |

An image or a code block is presentation: a question with a picture is not a
sixth grading branch, it is a multiple-choice (or multi-answer, or fill-in-the-
blank) question with something above the prompt. Three code paths pretending to
be one is how a grader starts disagreeing with its own review screen.

---

## 1. The vocabulary

One list, in [`packages/shared/src/question-type.ts`](../packages/shared/src/question-type.ts),
read by the database layer, the API, the grader and both consoles:

```ts
export const QUESTION_TYPES = ['MCQ', 'MULTI', 'TRUE_FALSE', 'FILL_BLANK'] as const;
```

Alongside it, the helpers that stop each layer from re-deciding what a format
means:

| Helper                              | Answers                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `isChoiceType(type)`                | does the student pick options at all? (`false` only for blank)             |
| `isMultiSelect(type)`               | checkboxes rather than radios? (`MULTI`)                                   |
| `hidesOptionsWhileRunning(t)`       | are the options the key, and therefore secret? (`FILL_BLANK`)              |
| `QUESTION_TYPE_LABELS`              | `Multiple choice`, `Multiple answers`, `True / false`, `Fill in the blank` |
| `QUESTION_TYPE_HINTS`               | the one-line explanation under the picker in the console                   |
| `TRUE_FALSE_OPTIONS`                | `['True', 'False']` — the pair nobody types by hand                        |
| `normaliseAnswer` / `answerMatches` | how a typed answer is compared                                             |

The shared `package.json` publishes each module as its own subpath
(`@quiz/shared/question-type`), so a server component can import the labels
without pulling the whole contract bundle into the browser.

---

## 2. What the database stores

Migration `packages/db/migrations/0004_silky_marauders.sql`:

```sql
ALTER TABLE questions ADD COLUMN type text DEFAULT 'MCQ' NOT NULL;
ALTER TABLE questions ADD COLUMN image_url text;
ALTER TABLE questions ADD COLUMN code_snippet text;
ALTER TABLE answers   ADD COLUMN selected_option_ids text;  -- JSON array of option ids
ALTER TABLE answers   ADD COLUMN answer_text text;          -- what was typed, trimmed
```

- **`questions.type`** defaults to `'MCQ'`, which is what makes the migration
  safe on rows that already exist: every question written before this feature is
  a multiple-choice question, because that was the only type.
- **`options.is_correct` carries the whole key.** A `MULTI` question flags
  several rows; a `FILL_BLANK` question flags all of its accepted answers. There
  is no second key column to drift out of sync with the first.
- **`answers.selected_option_id`** stays for a single pick.
  **`answers.selected_option_ids`** holds a JSON array for a set, and
  **`answers.answer_text`** holds the typed string (trimmed by the schema, stored
  raw otherwise — including the student's capitalisation, so the review can show
  what they actually wrote).
- **`answers.is_correct`** is still stamped once, at submit. It is null while the
  attempt is in progress and null for a skipped question — which is what lets the
  console tell "wrong" from "not answered".

Indexes are unchanged; `questions_quiz_idx` still covers the paper query.

---

## 3. Authoring — the API contract

`POST /api/admin/quizzes/:quizId/questions` and `PUT /api/admin/questions/:id`
take the same body, validated by `questionInputSchema` in
[`packages/shared/src/question.ts`](../packages/shared/src/question.ts):

| Field            | Meaning                                                                              |
| ---------------- | ------------------------------------------------------------------------------------ |
| `type`           | one of the four; defaults to `MCQ`                                                   |
| `questionText`   | 5–2000 characters                                                                    |
| `explanation`    | shown after grading; nullable                                                        |
| `marks`          | 1–10                                                                                 |
| `difficulty`     | `EASY` / `MEDIUM` / `HARD`                                                           |
| `imageUrl`       | a full `https://` URL, at most 1000 characters; nullable                             |
| `codeSnippet`    | at most 4000 characters; nullable                                                    |
| `options`        | `[{ id?, text }]`, 2–6 for the option formats, 1–6 accepted answers for `FILL_BLANK` |
| `correctIndex`   | index into `options`, for `MCQ` and `TRUE_FALSE`                                     |
| `correctIndexes` | indices into `options`, for `MULTI`                                                  |

Per-format refinements, all answered with `422`:

| Format       | Rule                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `MCQ`        | 2–6 options, they differ, `correctIndex` is inside the set                               |
| `MULTI`      | 2–6 options, **at least two** indices, no duplicates, all in range                       |
| `TRUE_FALSE` | may omit `options`; if given they must be the two-element pair; `correctIndex` is 0 or 1 |
| `FILL_BLANK` | at least one accepted answer, all of them different                                      |

`resolveQuestionInput` turns that payload into what is written, so create and
edit cannot disagree: a `TRUE_FALSE` always stores `['True', 'False']` whatever
it was sent, a `FILL_BLANK` marks every listed answer correct, and a `MULTI`
stores a sorted, de-duplicated index list.

### The format is fixed after creation

`PUT` replaces everything **except** the format. Sending a different `type` on an
existing question answers `422 QUESTION_TYPE_IMMUTABLE`. A question that was a
set yesterday and a typed answer today would make two students' reviews of the
same question read differently, and the console's disabled picker is only the
visible half of that rule — the API is the half that enforces it.

Editing in the question's own format is a normal full replace: options are
reconciled **by id**, so the option a student already picked keeps its identity
(and `409 OPTION_HAS_ANSWERS` protects it from deletion).

---

## 4. Authoring — the console

`/admin/quizzes/:id` → **Questions** (`components/question-form.tsx`):

1. **Format first.** Four radios with the shared label and hint. The picker is
   disabled when editing, with the reason printed beside it.
2. **Then the fields that format needs:**
   - `MCQ` — option rows with a radio for the key, add/remove (2–6).
   - `MULTI` — the same rows, but checkboxes; the form refuses fewer than two.
   - `TRUE_FALSE` — a single switch (True / False); no option rows at all.
   - `FILL_BLANK` — an accepted-answer list; one cell per spelling, each with its
     own `aria-label`, and an "Add another spelling" button.
3. **Then the shared fields:** an optional image URL, an optional code snippet,
   marks, difficulty and the explanation.
4. **Inline validation before the request.** `validateQuestionForm` in
   `lib/question-params.ts` returns the first problem in plain words ("Pick at
   least two correct options."), so the button disables rather than the request
   failing. The API re-checks everything: the client's copy is a courtesy.

The question list shows each question's format as a badge, its difficulty, marks
and — for a fill-in-the-blank — the accepted answers instead of option count, so
an administrator can tell the four apart without opening one.

---

## 5. Sitting a paper

`GET /api/student/attempts/:id` returns `type` and, where it applies, `imageUrl`
and `codeSnippet`. Two things it never returns:

- **no correctness**, for any format: `isCorrect` is not in the projection, and a
  test asserts the payload does not contain the string;
- **no options at all for a `FILL_BLANK`**, because there the options _are_ the
  answer key. The student gets the prompt, the marks and an input.

The runner (`components/quiz-runner.tsx`) then:

| Format       | Control                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `MCQ`        | radios inside a `<fieldset>`; one answer per question                                                                     |
| `MULTI`      | checkboxes, plus "tick every one — a missed box scores nothing"                                                           |
| `TRUE_FALSE` | the same radios, labelled True and False                                                                                  |
| `FILL_BLANK` | a text input with `autoComplete="off"`, `spellCheck={false}` and a hint that spelling is forgiving about case and spacing |

Autosave is per question and unchanged: choosing an option saves immediately, and
typing saves on a short debounce (an empty box saves as "nothing typed", which
clears the answer rather than storing an empty string). Answers are saved as
whatever shape the format needs:

```http
PUT /api/student/attempts/:id/answers/:questionId
{ "optionId": "…" }                  // MCQ, TRUE_FALSE
{ "optionIds": ["…", "…"] }          // MULTI
{ "answerText": "  DEF. " }          // FILL_BLANK
```

Exactly one of the three keys is accepted (`saveAnswerSchema`); zero or two
answers `422 ANSWER_SHAPE_MISMATCH`, and an option belonging to another question
answers `422 OPTION_NOT_FOUND`. An empty `optionIds` array is a legal way to
clear a set.

Accessibility notes, because a checkbox question and a radio question are not the
same thing to a keyboard: every control is a native `input`, the fieldset carries
the question text as its legend, the input has `aria-describedby` pointing at its
hint, and the answered/unanswered indicator stays in the same place across
formats so the page does not reflow as you move between them.

---

## 6. Grading

`gradeAttempt` in [`packages/shared/src/attempt.ts`](../packages/shared/src/attempt.ts)
is the only grader. Per question:

| Format       | Correct when                                                               |
| ------------ | -------------------------------------------------------------------------- |
| `MCQ`        | the saved option is the keyed option                                       |
| `TRUE_FALSE` | the saved option is the keyed option                                       |
| `MULTI`      | the saved **set** equals the keyed set exactly — all of them, nothing else |
| `FILL_BLANK` | `answerMatches(text, accepted)` — see below                                |

**Answered vs skipped.** A question counts as answered when the saved answer is
something the grader can read: a known option id, at least one known option id,
or non-blank text. A stale option id (deleted while the attempt was open), an
empty set and blank text are all "unanswered", which is the same state as never
having answered — so nothing is penalised twice.

**The typed comparison.** `normaliseAnswer` folds what a person cannot see:
NFKC normalisation (so a phone keyboard's wide forms compare correctly), curly
quotes to straight ones, leading and trailing space, runs of internal space, and
a trailing full stop or semicolon. Then it lowercases. Everything else is
significant: `postgres` is not `postgre`.

**All-or-nothing, on purpose.** A multiple-answer question is worth its marks or
nothing. Partial credit was considered and rejected: the pass mark, the
negative-marking penalty and every attempt total are written against "a question
is right or wrong", and changing that here would change `score`, `percentage` and
`passed` for every paper that contains a set — a grading-contract change, not a
question-type change. The review screen says so in words ("A missed box scores
nothing.") rather than leaving students to discover it.

**Negative marking** applies per wrong question exactly as before; a skipped
question never costs anything.

The result payload gains one field:

```json
"formats": [
  { "type": "MCQ", "total": 4, "correct": 3, "incorrect": 1, "unanswered": 0 },
  { "type": "MULTI", "total": 1, "correct": 1, "incorrect": 0, "unanswered": 0 }
]
```

There is one entry per format the paper **actually used** — a multiple-choice-only
paper gets one row — always in `QUESTION_TYPES` order. It is computed from the
same paper the grader just marked, by the same `formatBreakdown` the result screen
and the review call, so it cannot disagree with `correctAnswers`.

---

## 7. Results and review

Both screens share `components/format-breakdown.tsx`:

- **The result card** shows "By format" with `correct of total` per format, only
  when the paper used more than one format. A one-format paper's breakdown is the
  score repeated.
- **The review screen** shows the same strip at the top, and then, per question:
  a format badge; for `FILL_BLANK` the typed answer and the accepted list side by
  side; for `MULTI` every option that was ticked, the full key set, and a verdict
  line naming what was needed; for `MCQ`/`TRUE_FALSE` the familiar option list.

The verdict vocabulary is shared (`answerVerdict`): `CORRECT`, `INCORRECT`,
`UNANSWERED`, and the filter counts (`correct`, `wrong`, `skipped`) come from the
same function, so a filter can never show a question in two buckets.

The **administrator's** copy of one attempt (`/admin/attempts/:id`) reads the same
story from `answers.is_correct`, `selected_option_ids` and `answer_text` rather
than re-deriving it from the key — the console shows what the grader decided, not
what it would decide if asked again. A fill-in-the-blank appears as the typed
answer plus the accepted list; a set shows every option that was ticked. The
attempt's own `penalty` is displayed from the attempt row.

---

## 8. Import

`POST /api/admin/quizzes/:quizId/questions/import` takes the file's **text**, and
the browser parses it first with the same function (`parseQuestionImport`), so the
preview's counts, labels and error messages are the server's.

The columns are the original nine plus three optional ones, so a file written for
the single-answer importer still imports unchanged — it is simply a file of `MCQ`
rows.

```
question,option1,option2,option3,option4,correct,explanation,marks,difficulty,type,image,code
```

| `type`       | `option1`–`option4`            | `correct`                            |
| ------------ | ------------------------------ | ------------------------------------ |
| `MCQ`        | the options (two or more)      | one 1-based number                   |
| `MULTI`      | the options (two or more)      | two or more, e.g. `1\|3\|4`          |
| `TRUE_FALSE` | blank — the pair is fixed      | `true` / `false`, or `1` / `2`       |
| `FILL_BLANK` | one accepted spelling per cell | blank — every listed one is accepted |

- `image` takes a full `https://` URL or a path starting with `/`.
- `code` takes a snippet; quote a cell that contains commas or newlines (RFC 4180
  quoting is handled, including doubled quotes and a UTF-8 BOM).
- A blank option in the middle shifts nothing: `correct` counts the options that
  exist, in the order a human reads them.
- `.xlsx` is unzipped in the browser and converted to the same CSV text, so the
  API has one input format and the preview is not a guess.

Examples — one row of each format:

```csv
Which keyword defines a function in Python?,def,define,,,,,1,,FILL_BLANK,,
Which values are falsy?,0,NaN,null,[],1|3|4,,1,,MULTI,,
HTML is a programming language,,,,,false,,1,,TRUE_FALSE,,
Which tag holds the page body?,<body>,<head>,,,1,,1,,MCQ,https://example.com/a.png,
```

A row is resolved to its meaning before it is written — a true/false row is stored
with the server's pair, a fill-in-the-blank row with every answer keyed — and it
then goes through `createQuestion`, the same function the form uses. A 200-row
file is 200 small writes: slower than one multi-row insert, and the reason an
import cannot bypass a rule the form enforces.

A file whose rows are **all** wrong answers `422 IMPORT_NO_ROWS` with the first
row's message, rather than 200 with an empty `created` list — the client should
not have to compare two arrays to learn whether it worked. `dryRun: true` parses
and answers without writing.

---

## 9. The seed

`packages/db/src/seed.ts` writes 49 questions / 192 options, including one of
each non-MCQ format so a fresh database demonstrates the feature:

| Quiz       | Question                                                                  | Why it is there                   |
| ---------- | ------------------------------------------------------------------------- | --------------------------------- |
| HTML       | "HTML is a programming language" — `TRUE_FALSE`, false                    | the type people ask for first     |
| HTML       | a question with `imageUrl`                                                | image-based, on a multiple choice |
| JavaScript | "Which values are falsy?" — `MULTI`, key `[0, 2, 4]`, with a code snippet | a set, and code above the prompt  |
| Python     | "Which keyword defines a function?" — `FILL_BLANK`, accepts `def`         | a typed answer                    |

The simulated attempts in the seed answer those questions the way a student
would — the set as `selected_option_ids`, the keyword as `answer_text` — so the
seeded history contains graded examples of every shape, not just multiple choice.

---

## 10. What proves it

| Suite                                             | What it covers                                                                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/question-type.test.ts`       | the vocabulary, labels, `normaliseAnswer`, `answerMatches`                                                                                                                        |
| `packages/shared/src/attempt.test.ts`             | grading per format, the set rule, blank-as-unanswered, `formatBreakdown`                                                                                                          |
| `packages/shared/src/import.test.ts`              | every column/type rule, the error wording, the header's optionality                                                                                                               |
| `packages/shared/src/review.test.ts`              | `answerVerdict` per format                                                                                                                                                        |
| `packages/db/src/__tests__/seed.test.ts`          | key rules per format; "the seed demonstrates every format"                                                                                                                        |
| `apps/api/src/__tests__/question-formats.test.ts` | authoring, the immutable format, import of all four, the paper (no key, no options for a blank), the 422 shapes, a mixed paper's grading and review, and the administrator's copy |
| `apps/api/src/__tests__/landing.test.ts`          | the landing page's per-format counts add up to the bank                                                                                                                           |
| `apps/web/src/lib/question-params.test.ts`        | the form's per-format validation and the by-format summary                                                                                                                        |
| `scripts/spec-audit.ts` §10                       | 19 probes over HTTP: author, import, publish, sit, submit, review                                                                                                                 |

Run the lot with `bun run test`; the audit needs both servers up
(`bun run test:spec`). [`testing.md`](testing.md) has the inventory and the
manual checklist.

---

## 11. Limits, stated plainly

- **No match-the-following.** Argued in [`advanced-features.md`](advanced-features.md)
  §10: a matching question is a pair table plus a partial-credit rule the grader
  does not have, and building it as a disguised `MULTI` would look like one thing
  in the editor and grade like another.
- **No partial credit anywhere.** Every question is right or wrong, including a
  set. That is a choice about the pass mark and the penalty, not an oversight.
- **Six options maximum**, and the importer's four option columns mean a sheet
  can carry at most four; author the rest by hand.
- **A typed answer is compared, not interpreted.** No stemming, no synonyms
  beyond the list you write. If two spellings should pass, list both.
- **The format is immutable.** Delete and re-author to change it; the guard is
  `422 QUESTION_TYPE_IMMUTABLE`.
