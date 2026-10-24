'use client';

import type { AdminQuestion } from '@quiz/shared/question';
import type { ImportResult } from '@quiz/shared/import';
import {
  IMPORT_COLUMNS,
  IMPORT_HEADER,
  MAX_IMPORT_BYTES,
  parseQuestionImport,
} from '@quiz/shared/import';
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
 * "CSV" here includes what Excel exports — the parser handles quoted fields,
 * embedded commas, both line endings and a UTF-8 BOM. `.xlsx` is not a text
 * format; the dialog says so and offers the one-click sheet instead of failing
 * with a browser error.
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

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setError(
        'Excel workbooks are not text. Export the sheet as CSV (File → Save as → CSV) and drop that here — or paste the rows below.',
      );
      return;
    }

    const content = await file.text();
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
            CSV, one question per row. Nothing is saved until you press Import.
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
            {fileName ?? 'Choose a .csv file, or paste the rows below'}
          </span>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept=".csv,text/csv,text/plain"
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
            number (1–4), not the answer text. Blank options are ignored, so a three-option question
            works. Up to 200 rows per import.
          </p>
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
                <li key={index} className="text-[11.5px]">
                  <span className="text-muted-foreground mr-1 font-mono">{index + 1}.</span>
                  {question.questionText}
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
