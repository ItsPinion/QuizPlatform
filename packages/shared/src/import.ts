/**
 * Bulk question import.
 *
 * CSV, because it is the one format a spreadsheet, a text editor and a script
 * can all produce, and because Excel's "save as CSV" is a thing every admin
 * already knows how to do. The parser is written here, in the shared package,
 * rather than pulled from a dependency: RFC 4180 is a page of rules, and the
 * rules are the interesting part — quoted commas, doubled quotes, CRLF, a BOM
 * from Excel, and blank lines that must not become empty questions.
 *
 * The columns mirror the single-question form exactly:
 *
 *   question, option1..4, correct, explanation, marks, difficulty, type, image, code
 *
 * Everything after `difficulty` is optional, so a file written for the original
 * single-answer importer still uploads unchanged — it is simply a file of
 * `MCQ` rows. `type` is what makes the same file able to carry the other three
 * formats:
 *
 * | type         | `option1..4`                     | `correct`                        |
 * | ------------ | -------------------------------- | -------------------------------- |
 * | `MCQ`        | the options (2 or more)          | the 1-based number of the key    |
 * | `MULTI`      | the options (2 or more)          | two or more numbers, `1\|3\|4`   |
 * | `TRUE_FALSE` | blank — the pair is fixed        | `1`, `2`, `true` or `false`      |
 * | `FILL_BLANK` | one accepted answer per cell     | blank — every listed one is right|
 *
 * `type` defaults to `MCQ`, `correct` is 1-based because that is what a human
 * writes in a spreadsheet, and `image`/`code` apply to any format: a picture of
 * a sentence is a fill-in-the-blank question with an image above it.
 */
import { z } from 'zod';

import { difficultySchema } from './index';
import { MAX_CODE_SNIPPET, MAX_IMAGE_URL, MAX_MARKS, MAX_OPTIONS, MIN_OPTIONS } from './question';
import { QUESTION_TYPES, TRUE_FALSE_OPTIONS, type QuestionType } from './question-type';

export const IMPORT_COLUMNS = [
  'question',
  'option1',
  'option2',
  'option3',
  'option4',
  'correct',
  'explanation',
  'marks',
  'difficulty',
  'type',
  'image',
  'code',
] as const;

/** The header row, as the console shows it and the docs print it. */
export const IMPORT_HEADER = IMPORT_COLUMNS.join(',');

export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 256_000;

/* -------------------------------------------------------------------------- */
/*  CSV                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Split CSV text into rows of cells.
 *
 * A small state machine rather than a regex: quotes only mean something at the
 * start of a cell, a doubled quote inside a quoted cell is a literal quote, and
 * a newline inside quotes is part of the value (an explanation with a blank line
 * in it must survive).
 */
export function parseCsv(text: string): string[][] {
  // Excel writes a UTF-8 BOM; left in place it becomes part of the first header.
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];

  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      // CRLF: consume the LF of a CRLF pair.
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  // The last row has no trailing newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Blank lines (and the trailing empty row a final newline creates) are noise.
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

/* -------------------------------------------------------------------------- */
/*  Rows → questions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * One parsed question, in the shape the question form submits.
 *
 * It is deliberately *resolved* rather than raw: `correctIndexes` is already the
 * list the grader needs, `TRUE_FALSE` already carries its pair, and
 * `FILL_BLANK` already treats every listed answer as correct. The API can hand
 * this straight to `createQuestion`, so an imported question and a typed one
 * take the same path and obey the same rules.
 */
export const importQuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  questionText: z.string(),
  options: z.array(z.string()).max(MAX_OPTIONS),
  /** Indices into `options`. Empty only for `FILL_BLANK`, where none is needed. */
  correctIndexes: z.array(z.number().int().min(0)),
  imageUrl: z.string().nullable(),
  codeSnippet: z.string().nullable(),
  explanation: z.string().nullable(),
  marks: z.number().int().min(1).max(MAX_MARKS),
  difficulty: difficultySchema,
});
export type ImportQuestion = z.infer<typeof importQuestionSchema>;

export interface ImportIssue {
  /** 1-based data row (the header is not counted), so it matches a spreadsheet. */
  line: number;
  message: string;
}

export interface ImportResult {
  questions: ImportQuestion[];
  issues: ImportIssue[];
}

function cellAt(row: readonly string[], index: number): string {
  return (row[index] ?? '').trim();
}

/**
 * Read the `correct` cell as a list of 1-based option numbers.
 *
 * One number for `MCQ`, several for `MULTI`. Separators are forgiving — `|`,
 * `;`, `,` and spaces — because a spreadsheet cell holding `1, 3` is written by
 * a person, and a comma inside a quoted cell arrives here intact.
 */
function parseIndexList(raw: string): number[] | null {
  const parts = raw
    .split(/[|;,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');

  if (parts.length === 0) return null;

  const indexes: number[] = [];

  for (const part of parts) {
    const value = Number(part);
    if (!Number.isInteger(value) || value < 1) return null;
    indexes.push(value - 1);
  }

  return [...new Set(indexes)];
}

/** A true/false row may name its key in either the spreadsheet's language or the author's. */
function parseTrueFalseKey(raw: string): number | null {
  const value = raw.trim().toLowerCase();

  if (value === 'true' || value === 't' || value === '1') return 0;
  if (value === 'false' || value === 'f' || value === '2') return 1;

  return null;
}

/**
 * Parse an import file.
 *
 * The header is optional: if the first row looks like a header (`question` in
 * the first cell) it is skipped, otherwise every row is data. Anything wrong
 * with a row is collected as an `issue` and the row is skipped — one bad line
 * does not throw away the other ninety-nine, and the console can show exactly
 * which line to fix.
 */
export function parseQuestionImport(text: string): ImportResult {
  return parseQuestionImportRows(parseCsv(text));
}

/**
 * The same rules, from rows rather than text.
 *
 * Split out because an `.xlsx` workbook is not text: it is unzipped into cells
 * (see `xlsx.ts`) and then has to obey exactly the same header, marks, difficulty
 * and `correct`-column rules as a CSV. One implementation means a spreadsheet and
 * a `.csv` can never drift apart in what they accept.
 */
export function parseQuestionImportRows(rows: string[][]): ImportResult {
  if (rows.length === 0) {
    return { questions: [], issues: [{ line: 0, message: 'The file is empty.' }] };
  }

  const first = rows[0]!;
  const hasHeader = cellAt(first, 0).toLowerCase() === 'question';
  const data = hasHeader ? rows.slice(1) : rows;

  if (data.length === 0) {
    return { questions: [], issues: [{ line: 0, message: 'The file has a header but no rows.' }] };
  }

  if (data.length > MAX_IMPORT_ROWS) {
    return {
      questions: [],
      issues: [
        {
          line: 0,
          message: `Import at most ${MAX_IMPORT_ROWS} questions at a time (this file has ${data.length}).`,
        },
      ],
    };
  }

  const questions: ImportQuestion[] = [];
  const issues: ImportIssue[] = [];

  data.forEach((row, index) => {
    const line = index + 1;

    const fail = (message: string) => issues.push({ line, message });

    const questionText = cellAt(row, 0);

    if (questionText.length < 5) {
      fail('Question text must be at least 5 characters.');
      return;
    }

    const typeRaw = (cellAt(row, 9) || 'MCQ').toUpperCase();
    const type = QUESTION_TYPES.find((candidate) => candidate === typeRaw) as
      QuestionType | undefined;

    if (!type) {
      fail(`"type" must be one of ${QUESTION_TYPES.join(', ')} (got "${cellAt(row, 9)}").`);
      return;
    }

    const typedOptions = [1, 2, 3, 4].map((column) => cellAt(row, column));
    const providedOptions = typedOptions.filter((option) => option.length > 0);

    let options: string[];
    let correctIndexes: number[];

    if (type === 'TRUE_FALSE') {
      // The pair is fixed on purpose: letting a file write "Yes/No" or "T/F"
      // would produce the same question in four vocabularies, and the console
      // would show whichever one the file happened to use.
      if (providedOptions.length > 0) {
        fail(
          'A true/false question always uses the fixed True/False pair — leave option1–option4 blank.',
        );
        return;
      }

      options = [...TRUE_FALSE_OPTIONS];

      const key = parseTrueFalseKey(cellAt(row, 5));

      if (key === null) {
        fail(
          `"correct" must be true or false (or 1 or 2) for a true/false question (got "${cellAt(row, 5)}").`,
        );
        return;
      }

      correctIndexes = [key];
    } else if (type === 'FILL_BLANK') {
      if (providedOptions.length < 1) {
        fail('Give at least one accepted answer in option1–option4.');
        return;
      }

      const lower = new Set(providedOptions.map((option) => option.toLowerCase()));

      if (lower.size !== providedOptions.length) {
        fail('Accepted answers must be different from each other.');
        return;
      }

      // Every listed answer is correct, so the key is the whole list. The
      // `correct` column is not read: there is nothing for it to say.
      options = providedOptions;
      correctIndexes = providedOptions.map((_, optionIndex) => optionIndex);
    } else {
      if (providedOptions.length < MIN_OPTIONS) {
        fail(`Give at least ${MIN_OPTIONS} options.`);
        return;
      }

      const parsed = parseIndexList(cellAt(row, 5));

      if (parsed === null) {
        fail(
          type === 'MULTI'
            ? `"correct" must list option numbers, for example 1|3 (got "${cellAt(row, 5)}").`
            : `"correct" must be a column number (got "${cellAt(row, 5)}").`,
        );
        return;
      }

      const outOfRange = parsed.filter((value) => value >= providedOptions.length);

      if (outOfRange.length > 0) {
        fail(
          `"correct" must be between 1 and ${providedOptions.length} (got "${cellAt(row, 5)}").`,
        );
        return;
      }

      // A blank option in the middle shifts nothing: `correct` counts the
      // options that actually exist, in order, which is what a human sees.
      if (type === 'MULTI') {
        if (parsed.length < 2) {
          fail(
            `A multi-answer question needs at least two correct options (got "${cellAt(row, 5)}").`,
          );
          return;
        }
      } else if (parsed.length > 1) {
        fail(
          `A multiple-choice question has exactly one correct option — use type = MULTI for several (got "${cellAt(row, 5)}").`,
        );
        return;
      }

      options = providedOptions;
      correctIndexes = parsed.sort((left, right) => left - right);
    }

    const marksRaw = cellAt(row, 7);
    const marks = marksRaw === '' ? 1 : Number(marksRaw);

    if (!Number.isInteger(marks) || marks < 1 || marks > MAX_MARKS) {
      fail(`"marks" must be a whole number from 1 to ${MAX_MARKS}.`);
      return;
    }

    const difficultyRaw = (cellAt(row, 8) || 'MEDIUM').toUpperCase();
    const difficulty = difficultySchema.safeParse(difficultyRaw);

    if (!difficulty.success) {
      fail('"difficulty" must be EASY, MEDIUM or HARD.');
      return;
    }

    const imageUrl = cellAt(row, 10) || null;

    if (imageUrl !== null) {
      if (imageUrl.length > MAX_IMAGE_URL) {
        fail(`"image" must be at most ${MAX_IMAGE_URL} characters.`);
        return;
      }

      if (!/^(https?:\/\/|\/)/.test(imageUrl)) {
        fail('"image" must be a full https:// URL or a path starting with /.');
        return;
      }
    }

    const codeSnippetRaw = row[11] ?? '';
    const codeSnippet = codeSnippetRaw.trim() === '' ? null : codeSnippetRaw;

    if (codeSnippet !== null && codeSnippet.length > MAX_CODE_SNIPPET) {
      fail(`"code" must be at most ${MAX_CODE_SNIPPET} characters.`);
      return;
    }

    const explanation = cellAt(row, 6);

    questions.push({
      type,
      questionText,
      options,
      correctIndexes,
      imageUrl,
      codeSnippet,
      explanation: explanation === '' ? null : explanation,
      marks,
      difficulty: difficulty.data,
    });
  });

  return { questions, issues };
}

/**
 * The request body for `POST /api/admin/quizzes/:quizId/questions/import`.
 *
 * File *contents*, not a file: multipart uploads need a parser, a size limit and
 * a temp file for no gain here, and a text body lets the browser preview parse
 * exactly what it is about to send.
 */
export const questionImportRequestSchema = z.object({
  text: z.string().min(1, 'The file is empty'),
  /** Parse and answer, write nothing. */
  dryRun: z.boolean().optional().default(false),
});
export type QuestionImportRequest = z.infer<typeof questionImportRequestSchema>;

/** What the endpoint answers — the preview shape, plus what it actually wrote. */
export const questionImportResponseSchema = z.object({
  dryRun: z.boolean(),
  /** Ids of the questions created; empty on a dry run. */
  created: z.array(z.string()),
  accepted: z.number(),
  skipped: z.number(),
  issues: z.array(z.object({ line: z.number(), message: z.string() })),
  questions: z.array(importQuestionSchema),
});
export type QuestionImportResponse = z.infer<typeof questionImportResponseSchema>;

/**
 * Rows back to CSV text.
 *
 * The inverse of `parseCsv`, and the bridge between an `.xlsx` workbook and this
 * module's single text contract: the browser unzips the spreadsheet, converts it
 * here, and posts exactly what a `.csv` would have posted — so the API needs no
 * second input format, and the upload never has to fit the API's body budget
 * twice.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell ?? '';
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
}
