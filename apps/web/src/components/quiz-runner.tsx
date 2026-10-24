'use client';

import type { AttemptSession } from '@quiz/shared/attempt';
import { formatClock } from '@quiz/shared/attempt';
import { QUESTION_TYPE_LABELS, isChoiceType, isMultiSelect } from '@quiz/shared/question-type';
import type { AttemptResult } from '@quiz/shared/submission';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  Code2,
  Loader2,
  Lock,
  PenLine,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AttemptResultCard } from '@/components/attempt-result';
import { PageHeader } from '@/components/cinema/page-header';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import { difficultyTone } from '@/lib/quiz-params';
import { optionLetter, progressPercent } from '@/lib/student-params';
import { cn } from '@/lib/utils';

interface Props {
  initial: AttemptSession;
}

/** How one question is answered locally, whatever the format. */
interface LocalAnswer {
  /** One id on a radio question, the set on a checkbox question, none for text. */
  optionIds: string[];
  /** What was typed on a fill-in-the-blank question. */
  answerText: string;
}

type AnswerMap = Record<string, LocalAnswer>;

const EMPTY: LocalAnswer = { optionIds: [], answerText: '' };

function isAnswered(answer: LocalAnswer | undefined): boolean {
  if (!answer) return false;
  return answer.optionIds.length > 0 || answer.answerText.trim() !== '';
}

function toAnswerMap(session: AttemptSession): AnswerMap {
  return Object.fromEntries(
    session.answers.map((answer) => [
      answer.questionId,
      {
        optionIds: answer.selectedOptionIds.length
          ? answer.selectedOptionIds
          : answer.selectedOptionId
            ? [answer.selectedOptionId]
            : [],
        answerText: answer.answerText ?? '',
      },
    ]),
  );
}

/** How long to wait after the last keystroke before saving typed text. */
const TEXT_SAVE_DELAY_MS = 700;

/**
 * The quiz taker, in every format §10 defines.
 *
 * Four things are deliberately server-owned:
 *
 * - **the deadline** — the countdown is derived from `expiresAt`, and the tab
 *   re-reads it when it becomes visible again, so throttled timers or a system
 *   clock change cannot buy time;
 * - **the answer key** — the payload has no correctness flags at all, and a
 *   fill-in-the-blank question is sent with no options, because there the
 *   options *are* the key;
 * - **the writes** — every selection and every typed answer is a `PUT`, and a
 *   rejected write is rolled back in the UI instead of being shown as saved;
 * - **the score** — `POST …/submit` grades the paper. The button and the
 *   deadline both call it, and whichever arrives second gets the stored result
 *   back (`alreadySubmitted: true`) instead of a second grade.
 */
export function QuizRunner({ initial }: Props) {
  const questions = initial.questions;

  const [answers, setAnswers] = useState<AnswerMap>(() => toAnswerMap(initial));
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(initial.attempt.secondsRemaining);
  const [expired, setExpired] = useState(initial.attempt.expired);
  const [result, setResult] = useState<AttemptResult | null>(initial.attempt.result);
  const [saving, setSaving] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Local mirror of the server deadline; recomputed from `expiresAt` on resync.
  const deadline = useRef(Date.now() + initial.attempt.secondsRemaining * 1000);
  // A double click, the countdown and a manual submit must not race into three
  // submissions — the API is idempotent, but the UI should not be noisy either.
  const inFlight = useRef(false);
  // Pending "save this text" timer, so typing does not fire a request per key.
  const textTimer = useRef<number | null>(null);

  useEffect(() => {
    if (result) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSeconds(left);

      if (left === 0) setExpired(true);
    };

    tick();
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [result]);

  useEffect(
    () => () => {
      if (textTimer.current !== null) window.clearTimeout(textTimer.current);
    },
    [],
  );

  /**
   * Submit the paper — the student's click, or the clock reaching zero.
   *
   * The request carries no score and no claim about why it is being sent: the
   * server decides from `expiresAt` whether this was a manual or an automatic
   * submission.
   */
  const submit = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const res = await client.api.student.attempts[':id'].submit.$post({
        param: { id: initial.attempt.id },
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      const body = await res.json();
      setResult(body.result);
      setExpired(false);
      setConfirming(false);
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }, [initial.attempt.id]);

  /** The countdown hitting zero is a submission, not just a lock. */
  useEffect(() => {
    if (!expired || result || submitting) return;
    void submit();
  }, [expired, result, submit, submitting]);

  /** Re-sync with the server: deadline, status and any answers saved elsewhere. */
  const resync = useCallback(async () => {
    try {
      const res = await client.api.student.attempts[':id'].$get({
        param: { id: initial.attempt.id },
      });

      if (!res.ok) return;

      const fresh = await res.json();

      // Another tab may have submitted (or the deadline may have been settled by
      // a server read) — adopt that result instead of continuing to answer.
      if (fresh.attempt.result) {
        setResult(fresh.attempt.result);
        return;
      }

      deadline.current = Date.now() + fresh.attempt.secondsRemaining * 1000;
      setSeconds(fresh.attempt.secondsRemaining);
      setExpired(fresh.attempt.expired);
      setAnswers(toAnswerMap(fresh));
    } catch {
      // Offline is not fatal: the local countdown keeps running.
    }
  }, [initial.attempt.id]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void resync();
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [resync]);

  /** Write one answer of any shape, rolling the UI back when the server refuses. */
  const write = useCallback(
    async (questionId: string, patch: LocalAnswer, body: Record<string, unknown>) => {
      const previous = answers[questionId] ?? EMPTY;

      setAnswers((map) => ({ ...map, [questionId]: patch }));
      setSaving(questionId);
      setError(null);

      try {
        const res = await client.api.student.attempts[':id'].answers[':questionId'].$put({
          param: { id: initial.attempt.id, questionId },
          json: body as never,
        });

        if (!res.ok) {
          setAnswers((map) => ({ ...map, [questionId]: previous }));
          setError(parseApiFailure(await res.json()).message);
          return;
        }

        setSavedAt(Date.now());
      } catch (cause) {
        setAnswers((map) => ({ ...map, [questionId]: previous }));
        setError(toApiFailure(cause).message);
      } finally {
        setSaving(null);
      }
    },
    [answers, initial.attempt.id],
  );

  const chooseOption = useCallback(
    (questionId: string, optionId: string, multiple: boolean) => {
      const existing = answers[questionId] ?? EMPTY;

      const optionIds = multiple
        ? existing.optionIds.includes(optionId)
          ? existing.optionIds.filter((id) => id !== optionId)
          : [...existing.optionIds, optionId]
        : [optionId];

      void write(
        questionId,
        { optionIds, answerText: '' },
        multiple ? { optionIds } : { optionId: optionIds[0] ?? null },
      );
    },
    [answers, write],
  );

  /** Typed answers save shortly after the last keystroke, and on blur. */
  const changeText = useCallback(
    (questionId: string, answerText: string) => {
      setAnswers((map) => ({
        ...map,
        [questionId]: { optionIds: [], answerText },
      }));

      if (textTimer.current !== null) window.clearTimeout(textTimer.current);

      textTimer.current = window.setTimeout(() => {
        textTimer.current = null;
        void write(questionId, { optionIds: [], answerText }, { answerText: answerText.trim() });
      }, TEXT_SAVE_DELAY_MS);
    },
    [write],
  );

  const answered = useMemo(
    () => questions.filter((question) => isAnswered(answers[question.id])).length,
    [answers, questions],
  );

  if (result) {
    return (
      <AttemptResultCard
        result={result}
        quizTitle={initial.quiz.title}
        reviewHref={`/student/attempt/${initial.attempt.id}/review`}
      />
    );
  }

  const question = questions[current];

  if (!question) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm">
          This attempt has no questions.{' '}
          <Link href="/student/quizzes" className="text-primary hover:underline">
            Back to the catalogue
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const percent = progressPercent(answered, questions.length);
  const unanswered = questions.length - answered;
  const answer = answers[question.id] ?? EMPTY;
  const multiple = isMultiSelect(question.type);
  const typed = question.type === 'FILL_BLANK';

  return (
    <div className="space-y-6">
      <header className="space-y-5">
        <PageHeader
          label={`Attempt · question ${current + 1} of ${questions.length}`}
          title={initial.quiz.title}
          aside={
            <>
              <Badge variant="outline">{QUESTION_TYPE_LABELS[question.type]}</Badge>
              <Badge variant={difficultyTone(question.difficulty)} className="text-[9.5px]">
                {question.difficulty}
              </Badge>
              {expired ? (
                <Badge variant="destructive" className="gap-1.5">
                  <Lock className="size-3" />
                  time is up
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 font-mono">
                  <Clock className="size-3" />
                  <span role="timer" aria-label="Time remaining">
                    {formatClock(seconds)}
                  </span>
                </Badge>
              )}
            </>
          }
        />

        <div
          className="h-px w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Answered questions"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              expired ? 'bg-warning' : 'bg-white',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </header>

      {expired ? (
        <div
          role="alert"
          className="border-warning/40 bg-warning/10 text-warning flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
        >
          <Lock className="size-3.5 shrink-0" />
          <span className="flex-1">
            Time is up — answers are locked.{' '}
            {submitting
              ? 'Submitting your saved answers for grading…'
              : 'The attempt is being submitted automatically.'}
          </span>
          {!submitting ? (
            <Button variant="outline" size="sm" onClick={() => void submit()}>
              Submit now
            </Button>
          ) : (
            <Loader2 className="size-3.5 animate-spin" />
          )}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => void submit()}
            className="hover:text-foreground font-medium underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_232px]">
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                <span>
                  {question.marks} mark{question.marks === 1 ? '' : 's'}
                </span>
                <span className="font-mono">
                  {saving === question.id ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" /> saving
                    </span>
                  ) : savedAt ? (
                    <span className="text-success inline-flex items-center gap-1">
                      <Check className="size-3" /> saved
                    </span>
                  ) : null}
                </span>
              </div>

              {question.imageUrl ? (
                <figure className="border-border/70 mt-2 overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={question.imageUrl}
                    alt="Figure for this question"
                    className="max-h-72 w-full object-contain"
                    loading="lazy"
                  />
                </figure>
              ) : null}

              {question.codeSnippet ? (
                <div className="border-border/70 bg-muted/30 mt-2 overflow-x-auto rounded-lg border">
                  <div className="text-muted-foreground border-border/60 flex items-center gap-1.5 border-b px-3 py-1.5 text-[10px] tracking-wide uppercase">
                    <Code2 className="size-3" /> code
                  </div>
                  <pre className="px-3 py-2 text-[12px] leading-relaxed">
                    <code>{question.codeSnippet}</code>
                  </pre>
                </div>
              ) : null}

              <fieldset disabled={expired}>
                <legend className="mt-3 text-[15px] leading-snug font-medium">
                  {question.questionText}
                </legend>

                {typed ? (
                  <div className="mt-3 space-y-1.5">
                    <label
                      htmlFor={`answer-${question.id}`}
                      className="text-muted-foreground text-[11.5px]"
                    >
                      Type your answer
                    </label>
                    <Input
                      id={`answer-${question.id}`}
                      value={answer.answerText}
                      onChange={(event) => changeText(question.id, event.target.value)}
                      onBlur={() =>
                        void write(
                          question.id,
                          { optionIds: [], answerText: answer.answerText },
                          { answerText: answer.answerText.trim() },
                        )
                      }
                      placeholder="Your answer"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-describedby={`answer-help-${question.id}`}
                      className="max-w-md"
                    />
                    <p
                      id={`answer-help-${question.id}`}
                      className="text-muted-foreground text-[11px]"
                    >
                      Spelling is forgiving about case and spacing. Saves as you type.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {question.options.map((option, index) => {
                      const selected = answer.optionIds.includes(option.id);

                      return (
                        <label
                          key={option.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] transition-colors',
                            selected
                              ? 'border-primary/50 bg-primary/10'
                              : 'border-border/70 hover:bg-accent/40',
                            expired && 'cursor-not-allowed opacity-70',
                          )}
                        >
                          <input
                            type={multiple ? 'checkbox' : 'radio'}
                            name={`question-${question.id}`}
                            value={option.id}
                            checked={selected}
                            onChange={() => chooseOption(question.id, option.id, multiple)}
                            className="accent-primary mt-1 size-3.5"
                          />
                          <span className="text-muted-foreground mt-0.5 font-mono text-[10.5px]">
                            {optionLetter(index)}
                          </span>
                          <span className="flex-1">{option.text}</span>
                        </label>
                      );
                    })}

                    {multiple ? (
                      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                        <CheckCheck className="size-3" />
                        More than one is correct — tick every one. A missed box scores nothing.
                      </p>
                    ) : null}
                  </div>
                )}
              </fieldset>
            </CardHeader>

            <CardContent className="flex items-center justify-between gap-2 pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrent((index) => Math.max(0, index - 1))}
                disabled={current === 0}
              >
                <ArrowLeft />
                Previous
              </Button>

              <span className="text-muted-foreground text-[11px]">
                {isAnswered(answer) ? 'answered' : typed ? 'nothing typed yet' : 'not answered yet'}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrent((index) => Math.min(questions.length - 1, index + 1))}
                disabled={current === questions.length - 1}
              >
                Next
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>

          <p className="text-muted-foreground text-[11.5px]">
            <span className="text-foreground font-medium">Tip:</span> answers save as you go — you
            can leave and come back without losing them, but the clock keeps running.
          </p>
        </div>

        <aside className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[12.5px]">Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-5 gap-1.5">
                {questions.map((item, index) => {
                  const done = isAnswered(answers[item.id]);
                  const isCurrent = index === current;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCurrent(index)}
                      aria-current={isCurrent ? 'true' : undefined}
                      aria-label={`Question ${index + 1}${done ? ', answered' : ', not answered'}`}
                      className={cn(
                        'grid h-7 place-items-center rounded-md border font-mono text-[11px] transition-colors',
                        isCurrent && 'ring-primary ring-offset-background ring-2 ring-offset-1',
                        done
                          ? 'border-primary/40 bg-primary/15 text-primary'
                          : 'border-border/70 text-muted-foreground hover:bg-accent/50',
                      )}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              <dl className="text-muted-foreground space-y-1 text-[11.5px]">
                <div className="flex items-center justify-between">
                  <dt>Answered</dt>
                  <dd className="text-foreground tabular-nums">
                    {answered} / {questions.length}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Marks at stake</dt>
                  <dd className="text-foreground tabular-nums">{initial.quiz.totalMarks}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Pass mark</dt>
                  <dd className="text-foreground tabular-nums">{initial.quiz.passingScore}%</dd>
                </div>
              </dl>

              <p className="text-muted-foreground flex items-start gap-1.5 border-t border-white/10 pt-2 text-[10.5px] leading-relaxed">
                {isChoiceType(question.type) ? (
                  <>
                    <Check className="mt-0.5 size-3 shrink-0" />
                    {isMultiSelect(question.type)
                      ? 'Checkbox questions need every correct answer.'
                      : 'Radio questions take a single answer.'}
                  </>
                ) : (
                  <>
                    <PenLine className="mt-0.5 size-3 shrink-0" />
                    Typed answers are matched against the author's accepted list.
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 py-4">
              {confirming ? (
                <div className="space-y-2">
                  <p className="text-[11.5px] leading-relaxed">
                    {unanswered === 0
                      ? 'Submit and get your score?'
                      : `${unanswered} question${unanswered === 1 ? '' : 's'} still unanswered — they score zero. Submit anyway?`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void submit()}
                      disabled={submitting}
                      className="flex-1"
                    >
                      {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                      {submitting ? 'Grading…' : 'Submit now'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirming(false)}
                      disabled={submitting}
                    >
                      Keep working
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => setConfirming(true)}
                  disabled={submitting || expired}
                >
                  <Send />
                  Submit quiz
                </Button>
              )}

              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Submitting locks the paper and grades it on the server. Running out of time submits
                it for you.
              </p>
              <Link
                href="/student/quizzes"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'w-full')}
              >
                Leave for now
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
        <Clock className="size-3" />
        Deadline {new Date(initial.attempt.expiresAt).toLocaleTimeString()} · server-enforced (wire
        time is authoritative, this view is a mirror).
      </p>
    </div>
  );
}
