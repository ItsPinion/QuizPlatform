'use client';

import type { AdminQuestion } from '@quiz/shared/question';
import type { ImportResult } from '@quiz/shared/import';
import { QUESTION_TYPE_LABELS } from '@quiz/shared/question-type';
import {
  IMPORT_COLUMNS,
  IMPORT_HEADER,
  MAX_IMPORT_BYTES,
  parseQuestionImport,
  parseQuestionImportRows,
} from '@quiz/shared/import';
import { isWorkbook, readWorkbook } from '@quiz/shared/xlsx';
import { CircleAlert, CircleCheck, FileUp, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';

/**
 * Import questions from a spreadsheet.
 *
 * The file is read and parsed **in the browser** first, with the same function
 * the API uses (`parseQuestionImport`), so the preview is not a guess: the row
 * count, the errors and the exact wording of each error are the ones the server
 * would produce. Nothing is sent until the administrator has seen that.
 *
 * Both formats the brief asks for are accepted:
 *
 *   - **CSV**, including what Excel's "save as CSV" writes (quoted fields,
 *     embedded commas, CRLF, a UTF-8 BOM);
 *   - **`.xlsx`**, unzipped *in the browser* by `@quiz/shared/xlsx`, mapped to
 *     rows and converted to the same CSV text the server already accepts. No
 *     second endpoint, no upload size limit double-counted, and nothing about
 *     the workbook is trusted before the preview shows it.
 *
 * The legacy binary `.xls` is not a zip and is refused with a one-line
 * instruction rather than a stack trace.
 *
 * Every format can be imported: the optional `type` column says what each row
 * is, and the parser resolves it before the preview is shown — a multi-answer
 * row lists several correct numbers, a true/false row may leave the options
 * blank, and a fill-in-the-blank row puts each accepted spelling in an option
 * cell. The preview labels each row with its format, so nothing arrives in the
 * quiz as a surprise.
 */
export function QuestionImport({
  quizId,
  onImported,
}: {
  quizId: string;
  onImported: (questions: AdminQuestion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setText('');
    setPreview(null);
    setFileName(null);
    setError(null);
    setDone(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function onFile(file: File | undefined) {
    if (!file) return;

    setError(null);
    setDone(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setError(
        `That file is ${Math.round(file.size / 1000)} kB. Import at most ${Math.round(MAX_IMPORT_BYTES / 1000)} kB at a time.`,
      );
      return;
    }

    if (/\.xls$/i.test(file.name)) {
      setError(
        'That is the old Excel format (.xls), which is not a workbook we can read. Re-save it as .xlsx or as CSV and try again.',
      );
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // A workbook is a zip whatever it is called, so the bytes decide — a `.csv`
    // exported by a tool that writes a BOM is still text, and a `.xlsx` renamed
    // to `.txt` is still a workbook.
    if (isWorkbook(bytes)) {
      try {
        const rows = readWorkbook(bytes);
        const csv = rows
          .map((row) =>
            row
              .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
              .join(','),
          )
          .join('\n');

        setFileName(`${file.name} → CSV rows`);
        setText(csv);
        setPreview(parseQuestionImportRows(rows));
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `That workbook could not be read: ${cause.message}`
            : 'That workbook could not be read.',
        );
      }

      return;
    }

    const content = new TextDecoder().decode(bytes);
    setFileName(file.name);
    setText(content);
    setPreview(parseQuestionImport(content));
  }

  function onTextarea(value: string) {
    setText(value);
    setFileName(null);
    setPreview(value.trim() === '' ? null : parseQuestionImport(value));
  }

  async function commit() {
    setPending(true);
    setError(null);

    try {
      const res = await client.api.admin.quizzes[':quizId'].questions.import.$post({
        param: { quizId },
        json: { text, dryRun: false },
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setDone(body.accepted);

      // Re-read the list rather than inventing rows: the API decided positions.
      const list = await client.api.admin.quizzes[':quizId'].questions.$get({ param: { quizId } });
      if (list.ok) onImported((await list.json()).questions);

      reset();
      setDone(body.accepted);
      setOpen(false);
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(false);
    }
  }

  const accepted = preview?.questions.length ?? 0;
  const issues = preview?.issues ?? [];

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <FileUp />
          Import
        </Button>
        {done !== null ? (
          <span className="text-success inline-flex items-center gap-1.5 text-[12px]">
            <CircleCheck aria-hidden className="size-3.5" />
            Imported {done} question{done === 1 ? '' : 's'}.
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-background/50 space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13.5px] font-medium">Import questions</p>
          <p className="text-muted-foreground mt-0.5 text-[11.5px]">
            CSV or Excel (.xlsx), one question per row — all four question formats. Nothing is saved
            until you press Import.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Close
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)]">
        <label
          htmlFor="import-file"
          className="border-border/70 hover:border-primary/40 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-center"
        >
          <Upload aria-hidden className="text-muted-foreground mx-auto size-4" />
          <span className="text-muted-foreground text-[12.5px]">
            {fileName ?? 'Choose a .csv or .xlsx file, or paste the rows below'}
          </span>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>

        <div className="space-y-1.5">
          <label htmlFor="import-text" className="text-[12px] font-medium">
            Or paste rows
          </label>
          <textarea
            id="import-text"
            value={text}
            onChange={(event) => onTextarea(event.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={`${IMPORT_HEADER}\nWhat does HTML stand for?,HyperText Markup Language,…`}
            className="border-border/70 bg-background/60 w-full rounded-lg border px-3 py-2 font-mono text-[11.5px] focus-visible:ring-2 focus-visible:ring-white/15 focus-visible:outline-none"
          />
        </div>
      </div>

      <details className="text-[11.5px]">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
          Columns and rules
        </summary>
        <div className="text-muted-foreground mt-2 space-y-1.5 leading-relaxed">
          <p className="font-mono text-[11px] break-all">{IMPORT_COLUMNS.join(', ')}</p>
          <p>
            The header row is optional. <span className="font-mono">correct</span> is the option
            number (1–4), not the answer text; blank options are ignored, so a three-option question
            works. Up to 200 rows per import.
          </p>
          <dl className="grid gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
            <dt className="font-mono text-[11px]">MCQ</dt>
            <dd>one number in correct, for example 2.</dd>
            <dt className="font-mono text-[11px]">MULTI</dt>
            <dd>
              two or more numbers in correct, for example 1|3|4 — the student must pick exactly
              those.
            </dd>
            <dt className="font-mono text-[11px]">TRUE_FALSE</dt>
            <dd>
              leave option1–option4 blank and write true or false in correct; the pair is fixed.
            </dd>
            <dt className="font-mono text-[11px]">FILL_BLANK</dt>
            <dd>
              put each accepted spelling in option1, option2… every listed one is accepted, so
              correct stays blank.
            </dd>
            <dt className="font-mono text-[11px]">image / code</dt>
            <dd>
              optional for any format: a full https:// image, and a code snippet (quote the cell if
              it contains commas or newlines).
            </dd>
          </dl>
        </div>
      </details>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <Badge variant={accepted > 0 ? 'success' : 'destructive'} className="text-[10px]">
              {accepted} ready
            </Badge>
            {issues.length > 0 ? (
              <Badge variant="warning" className="text-[10px]">
                {issues.length} skipped
              </Badge>
            ) : null}
          </div>

          {issues.length > 0 ? (
            <ul className="space-y-1">
              {issues.slice(0, 8).map((issue) => (
                <li
                  key={`${issue.line}-${issue.message}`}
                  className="text-warning flex items-start gap-1.5 text-[11.5px]"
                >
                  <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
                  <span>
                    {issue.line > 0 ? `Line ${issue.line}: ` : ''}
                    {issue.message}
                  </span>
                </li>
              ))}
              {issues.length > 8 ? (
                <li className="text-muted-foreground text-[11.5px]">
                  …and {issues.length - 8} more.
                </li>
              ) : null}
            </ul>
          ) : null}

          {accepted > 0 ? (
            <ul className="border-border/50 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
              {preview.questions.slice(0, 20).map((question, index) => (
                <li key={index} className="flex flex-wrap items-baseline gap-1.5 text-[11.5px]">
                  <span className="text-muted-foreground font-mono">{index + 1}.</span>
                  <Badge variant="outline" className="text-[9.5px] uppercase">
                    {QUESTION_TYPE_LABELS[question.type]}
                  </Badge>
                  <span className="min-w-0">{question.questionText}</span>
                  {question.imageUrl ? (
                    <span className="text-muted-foreground text-[10.5px]">with an image</span>
                  ) : null}
                  {question.codeSnippet ? (
                    <span className="text-muted-foreground text-[10.5px]">with code</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || accepted === 0} onClick={() => void commit()}>
          {pending ? <Loader2 className="animate-spin" /> : <FileUp />}
          Import {accepted > 0 ? `${accepted} question${accepted === 1 ? '' : 's'}` : ''}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} disabled={pending}>
          Clear
        </Button>
      </div>
    </div>
  );
}
