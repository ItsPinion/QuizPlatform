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
 *   question, option1, option2, option3, option4, correct, explanation, marks, difficulty
 *
 * `correct` is 1-based (`1` = option1), which is what a human writes in a
 * spreadsheet. `option3`/`option4` may be blank for a true two-option question;
 * `explanation`, `marks` and `difficulty` are optional.
 */
import { z } from 'zod';

import { difficultySchema } from './index';
import { MAX_MARKS, MAX_OPTIONS, MIN_OPTIONS } from './question';

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

/** One parsed question, in the shape the question form submits. */
export const importQuestionSchema = z.object({
  questionText: z.string(),
  options: z.array(z.string()).min(MIN_OPTIONS).max(MAX_OPTIONS),
  correctIndex: z.number().int().min(0),
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
 * Parse an import file.
 *
 * The header is optional: if the first row looks like a header (`question` in
 * the first cell) it is skipped, otherwise every row is data. Anything wrong
 * with a row is collected as an `issue` and the row is skipped — one bad line
 * does not throw away the other ninety-nine, and the console can show exactly
 * which line to fix.
 */
export function parseQuestionImport(text: string): ImportResult {
  const rows = parseCsv(text);
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
    const questionText = cellAt(row, 0);

    if (questionText.length < 5) {
      issues.push({ line, message: 'Question text must be at least 5 characters.' });
      return;
    }

    const rawOptions = [1, 2, 3, 4].map((column) => cellAt(row, column));
    const options = rawOptions.filter((option) => option.length > 0);

    if (options.length < MIN_OPTIONS) {
      issues.push({ line, message: `Give at least ${MIN_OPTIONS} options.` });
      return;
    }

    const correctRaw = cellAt(row, 5);
    const correct = Number(correctRaw);

    if (!Number.isInteger(correct) || correct < 1 || correct > options.length) {
      issues.push({
        line,
        message: `"correct" must be a column number between 1 and ${options.length} (got "${correctRaw}").`,
      });
      return;
    }

    // A blank option in the middle shifts nothing: `correct` counts the
    // options that actually exist, in order, which is what a human sees.
    const marksRaw = cellAt(row, 7);
    const marks = marksRaw === '' ? 1 : Number(marksRaw);

    if (!Number.isInteger(marks) || marks < 1 || marks > MAX_MARKS) {
      issues.push({ line, message: `"marks" must be a whole number from 1 to ${MAX_MARKS}.` });
      return;
    }

    const difficultyRaw = (cellAt(row, 8) || 'MEDIUM').toUpperCase();
    const difficulty = difficultySchema.safeParse(difficultyRaw);

    if (!difficulty.success) {
      issues.push({ line, message: '"difficulty" must be EASY, MEDIUM or HARD.' });
      return;
    }

    const explanation = cellAt(row, 6);

    questions.push({
      questionText,
      options,
      correctIndex: correct - 1,
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
