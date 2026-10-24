'use client';

import type { AdminQuestion } from '@quiz/shared/question';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleDashed,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { QuestionForm } from '@/components/question-form';
import { QuestionImport } from '@/components/question-import';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { DIFFICULTY_TONE, moveItem, summarizeQuestions } from '@/lib/question-params';

interface Props {
  quizId: string;
  quizStatus: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED';
  initialQuestions: AdminQuestion[];
}

/**
 * The question authoring surface for one quiz.
 *
 * Everything that changes a question goes through the API and comes back as the
 * stored row, so the panel never renders an optimistic guess: after each write
 * it re-reads the list. Reordering sends the whole new order, which is what the
 * endpoint expects — a partial order would leave the rest ambiguous.
 */
export function QuestionsPanel({ quizId, quizStatus, initialQuestions }: Props) {
  const router = useRouter();

  const [questions, setQuestions] = useState<AdminQuestion[]>(initialQuestions);
  const [mode, setMode] = useState<{ kind: 'new' } | { kind: 'edit'; id: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(initialQuestions[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const summary = summarizeQuestions(questions);
  const editing = mode?.kind === 'edit' ? questions.find((q) => q.id === mode.id) : undefined;

  async function refresh() {
    const res = await client.api.admin.quizzes[':quizId'].questions.$get({ param: { quizId } });

    if (res.ok) {
      const body = await res.json();
      setQuestions(body.questions);
    }

    // The page header shows questionCount / publish readiness — let it re-render.
    router.refresh();
  }

  function onSaved(question: AdminQuestion) {
    setQuestions((current) => {
      const exists = current.some((row) => row.id === question.id);
      return exists
        ? current.map((row) => (row.id === question.id ? question : row))
        : [...current, question].sort((a, b) => a.position - b.position);
    });

    setExpanded(question.id);
    setMode(null);
    setError(null);
    void refresh();
  }

  async function move(index: number, delta: number) {
    const reordered = moveItem(questions, index, delta);
    if (reordered === questions) return;

    setBusy('order');
    setError(null);

    try {
      const res = await client.api.admin.quizzes[':quizId'].questions.order.$patch({
        param: { quizId },
        json: { ids: reordered.map((question) => question.id) },
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setQuestions(body.questions);
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      return;
    }

    setBusy(id);
    setError(null);

    try {
      const res = await client.api.admin.questions[':id'].$delete({ param: { id } });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      setConfirmingDelete(null);
      await refresh();
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setBusy(null);
    }
  }

  const lastQuestionPublished = quizStatus === 'PUBLISHED' && questions.length <= 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <span>
            <span className="text-foreground font-medium tabular-nums">{summary.total}</span>{' '}
            question{summary.total === 1 ? '' : 's'}
          </span>
          <span>
            <span className="text-foreground font-medium tabular-nums">{summary.marks}</span> marks
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="text-success size-3.5" />
            {summary.byDifficulty.EASY} easy
          </span>
          <span>{summary.byDifficulty.MEDIUM} medium</span>
          <span>{summary.byDifficulty.HARD} hard</span>
          {summary.answered > 0 ? (
            <span className="text-warning">{summary.answered} answered · locked for deletion</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <QuestionImport
            quizId={quizId}
            onImported={(questions) => {
              setQuestions(questions);
              setError(null);
              router.refresh();
            }}
          />

          <Button
            size="sm"
            onClick={() => setMode(mode?.kind === 'new' ? null : { kind: 'new' })}
            disabled={mode?.kind === 'edit'}
          >
            <Plus />
            Add question
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-[12.5px]"
        >
          {error}
        </div>
      ) : null}

      {mode?.kind === 'new' ? (
        <QuestionForm
          quizId={quizId}
          onSaved={onSaved}
          onCancel={() => {
            setMode(null);
            setError(null);
          }}
        />
      ) : null}

      {questions.length === 0 && mode?.kind !== 'new' ? (
        <div className="border-border/70 rounded-xl border border-dashed px-4 py-10 text-center">
          <CircleDashed className="text-muted-foreground/70 mx-auto size-5" />
          <p className="mt-2 text-sm font-medium">No questions yet.</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-[12.5px]">
            A quiz needs at least one question before it can be published. Add one above — options
            and the correct answer are part of the same form.
          </p>
        </div>
      ) : null}

      <ol className="space-y-3">
        {questions.map((question, index) => {
          const open = expanded === question.id;
          const locked = question.answerCount > 0;
          const blockLastPublished = lastQuestionPublished && questions.length === 1;

          return (
            <li
              key={question.id}
              className="border-border/70 bg-background/40 overflow-hidden rounded-xl border"
            >
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="bg-muted text-muted-foreground mt-0.5 grid size-6 shrink-0 place-items-center rounded-md font-mono text-[11px]">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug font-medium">{question.questionText}</p>
                  <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <Badge variant={DIFFICULTY_TONE[question.difficulty]} className="text-[9.5px]">
                      {question.difficulty}
                    </Badge>
                    <span>
                      {question.marks} mark{question.marks === 1 ? '' : 's'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {question.options.length} option{question.options.length === 1 ? '' : 's'}
                    </span>
                    {locked ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-warning">
                          {question.answerCount} recorded answer
                          {question.answerCount === 1 ? '' : 's'}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || busy === 'order'}
                    aria-label="Move up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => move(index, 1)}
                    disabled={index === questions.length - 1 || busy === 'order'}
                    aria-label="Move down"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMode({ kind: 'edit', id: question.id })}
                    disabled={mode?.kind === 'edit' && mode.id !== question.id}
                    aria-label="Edit question"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant={confirmingDelete === question.id ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => remove(question.id)}
                    disabled={locked || blockLastPublished || busy === question.id}
                    aria-label="Delete question"
                    title={
                      locked
                        ? 'Students have answered this question'
                        : blockLastPublished
                          ? 'Unpublish the quiz before deleting its last question'
                          : 'Delete question'
                    }
                  >
                    {busy === question.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpanded(open ? null : question.id)}
                    aria-label={open ? 'Hide options' : 'Show options'}
                  >
                    {open ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </div>
              </div>

              {open ? (
                <div className="border-border/60 space-y-2 border-t px-4 py-3">
                  <ul className="grid gap-1.5 sm:grid-cols-2">
                    {question.options.map((option, optionIndex) => (
                      <li
                        key={option.id}
                        className={
                          option.isCorrect
                            ? 'border-success/30 bg-success/10 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]'
                            : 'border-border/60 flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-[12.5px]'
                        }
                      >
                        <span className="text-muted-foreground font-mono text-[10.5px]">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span className="flex-1">{option.text}</span>
                        {option.isCorrect ? (
                          <Check className="text-success size-3.5 shrink-0" />
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {question.explanation ? (
                    <p className="text-muted-foreground text-[12px]">
                      <span className="text-foreground font-medium">Why:</span>{' '}
                      {question.explanation}
                    </p>
                  ) : (
                    <p className="text-muted-foreground/70 text-[11.5px]">
                      No explanation yet — it is shown in the answer review after a student submits.
                    </p>
                  )}
                </div>
              ) : null}

              {mode?.kind === 'edit' && mode.id === question.id && editing ? (
                <div className="border-border/60 border-t p-3">
                  <QuestionForm
                    quizId={quizId}
                    question={editing}
                    onSaved={onSaved}
                    onCancel={() => {
                      setMode(null);
                      setError(null);
                    }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
