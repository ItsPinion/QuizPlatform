'use client';

import type { AdminQuestion } from '@quiz/shared/question';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_HINTS,
  QUESTION_TYPE_LABELS,
  TRUE_FALSE_OPTIONS,
  isMultiSelect,
  type QuestionType,
} from '@quiz/shared/question-type';
import { CircleCheck, ImageIcon, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { client } from '@/lib/api';
import { parseApiFailure, toApiFailure } from '@/lib/api-error';
import {
  emptyQuestionForm,
  MAX_QUESTION_OPTIONS,
  MIN_QUESTION_OPTIONS,
  questionToForm,
  toQuestionPayload,
  validateQuestionForm,
  type QuestionForm as FormState,
} from '@/lib/question-params';
import { cn } from '@/lib/utils';

interface Props {
  quizId: string;
  /** Present when editing an existing question; absent when authoring a new one. */
  question?: AdminQuestion;
  onSaved: (question: AdminQuestion) => void;
  onCancel: () => void;
}

/**
 * Author one question, in any of §10's formats.
 *
 * The type picker sits at the top and the body below it changes to match, so
 * there is no way to author a "multiple answers" question with one answer: the
 * radio becomes a checkbox, the fill-in-the-blank gets an accepted-answer list,
 * and the true/false gets two fixed buttons. Option ids are carried through
 * edits so a question can be fixed without orphaning answers students gave.
 */
export function QuestionForm({ quizId, question, onSaved, onCancel }: Props) {
  const editing = Boolean(question);

  const [form, setForm] = useState<FormState>(() =>
    question ? questionToForm(question) : emptyQuestionForm(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function changeType(type: QuestionType) {
    setForm((current) => {
      if (current.type === type) return current;

      if (type === 'TRUE_FALSE') {
        return {
          ...current,
          type,
          options: TRUE_FALSE_OPTIONS.map((text) => ({ text })),
          correctIndexes: current.correctIndexes[0] === 1 ? [1] : [0],
        };
      }

      if (type === 'FILL_BLANK') {
        return {
          ...current,
          type,
          options:
            current.options.length > 0 && current.options.every((option) => !option.id)
              ? current.options
              : [{ text: '' }, { text: '' }],
          correctIndexes: [],
        };
      }

      // Coming back from a type that stored no index (or many) to one that needs
      // exactly one: keep the first selection so the form is never invalid by
      // virtue of having been switched.
      return {
        ...current,
        type,
        options:
          current.options.length >= MIN_QUESTION_OPTIONS
            ? current.options
            : emptyQuestionForm().options,
        correctIndexes: current.correctIndexes.length > 0 ? [current.correctIndexes[0]!] : [0],
      };
    });
  }

  function toggleCorrect(index: number, checked: boolean) {
    setForm((current) => ({
      ...current,
      correctIndexes: checked
        ? [...new Set([...current.correctIndexes, index])].sort((left, right) => left - right)
        : current.correctIndexes.filter((value) => value !== index),
    }));
  }

  function updateOption(index: number, text: string) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, position) =>
        position === index ? { ...option, text } : option,
      ),
    }));
  }

  function addOption() {
    setForm((current) =>
      current.options.length >= MAX_QUESTION_OPTIONS
        ? current
        : { ...current, options: [...current.options, { text: '' }] },
    );
  }

  function removeOption(index: number) {
    setForm((current) => {
      if (current.options.length <= MIN_QUESTION_OPTIONS) return current;

      const options = current.options.filter((_, position) => position !== index);
      // Keep the key on a real row: removing a selected row clamps the selection
      // to the same slot, and every index after it shifts down by one.
      const correctIndexes = current.correctIndexes
        .filter((value) => value !== index)
        .map((value) => (value > index ? value - 1 : value));

      return {
        ...current,
        options,
        correctIndexes:
          correctIndexes.length > 0
            ? correctIndexes
            : current.type === 'FILL_BLANK'
              ? []
              : [Math.min(index, options.length - 1)],
      };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const invalid = validateQuestionForm(form);
    if (invalid) {
      setError(invalid);
      return;
    }

    setPending(true);
    setError(null);

    const payload = toQuestionPayload(form);

    try {
      if (editing && question) {
        const res = await client.api.admin.questions[':id'].$put({
          param: { id: question.id },
          json: payload,
        });

        if (!res.ok) {
          setError(parseApiFailure(await res.json()).message);
          return;
        }

        onSaved((await res.json()).question);
        return;
      }

      const res = await client.api.admin.quizzes[':quizId'].questions.$post({
        param: { quizId },
        json: payload,
      });

      if (!res.ok) {
        setError(parseApiFailure(await res.json()).message);
        return;
      }

      onSaved((await res.json()).question);
    } catch (cause) {
      setError(toApiFailure(cause).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-border/70 bg-background/40 space-y-4 rounded-xl border p-4"
      noValidate
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-medium">{editing ? 'Edit question' : 'New question'}</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel">
          <X />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="questionType">Answer format</Label>
          <Select
            id="questionType"
            value={form.type}
            onChange={(event) => changeType(event.target.value as QuestionType)}
            disabled={editing}
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {QUESTION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            {editing
              ? 'The format is fixed once a question exists — students may already have answered in it.'
              : QUESTION_TYPE_HINTS[form.type]}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="questionMarksTop">
            Marks <span className="text-muted-foreground font-normal">1–10</span>
          </Label>
          <Input
            id="questionMarksTop"
            type="number"
            min={1}
            max={10}
            value={form.marks}
            onChange={(event) => update('marks', event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="questionText">Question</Label>
        <textarea
          id="questionText"
          value={form.questionText}
          onChange={(event) => update('questionText', event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Which method converts a JSON string into an object?"
          className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
        />
      </div>

      {form.type === 'TRUE_FALSE' ? (
        <fieldset className="space-y-2">
          <legend className="text-[12.5px] font-medium">
            The statement is{' '}
            <span className="text-muted-foreground font-normal">— pick the correct one</span>
          </legend>

          <div className="flex flex-wrap gap-2">
            {TRUE_FALSE_OPTIONS.map((label, index) => {
              const selected = form.correctIndexes.includes(index);

              return (
                <label
                  key={label}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-[13px] transition-colors',
                    selected
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/70 hover:bg-accent/40',
                  )}
                >
                  <input
                    type="radio"
                    name="trueFalse"
                    checked={selected}
                    onChange={() => update('correctIndexes', [index])}
                    className="accent-primary size-3.5"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : form.type === 'FILL_BLANK' ? (
        <fieldset className="space-y-2">
          <legend className="text-[12.5px] font-medium">
            Accepted answers{' '}
            <span className="text-muted-foreground font-normal">
              — every spelling you will mark right
            </span>
          </legend>

          {form.options.map((option, index) => (
            <div key={option.id ?? `new-${index}`} className="flex items-center gap-2">
              <span className="text-muted-foreground w-4 font-mono text-[10.5px]">{index + 1}</span>
              <Input
                value={option.text}
                onChange={(event) => updateOption(index, event.target.value)}
                placeholder={index === 0 ? 'CSS' : 'Cascading Style Sheets'}
                aria-label={`Accepted answer ${index + 1}`}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeOption(index)}
                disabled={form.options.length <= 1}
                aria-label={`Remove accepted answer ${index + 1}`}
              >
                <Trash2 />
              </Button>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={form.options.length >= MAX_QUESTION_OPTIONS}
          >
            <Plus />
            Add another accepted answer
          </Button>

          <p className="text-muted-foreground text-[11px] leading-relaxed">
            Matching ignores case, extra spaces and a trailing full stop. Nothing is shown to the
            student while they are answering.
          </p>
        </fieldset>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-[12.5px] font-medium">
            Options{' '}
            <span className="text-muted-foreground font-normal">
              — {isMultiSelect(form.type) ? 'tick every correct one' : 'pick the correct one'}
            </span>
          </legend>

          {form.options.map((option, index) => {
            const checked = form.correctIndexes.includes(index);

            return (
              <div key={option.id ?? `new-${index}`} className="flex items-center gap-2">
                <input
                  type={isMultiSelect(form.type) ? 'checkbox' : 'radio'}
                  name="correctIndex"
                  checked={checked}
                  onChange={(event) =>
                    isMultiSelect(form.type)
                      ? toggleCorrect(index, event.target.checked)
                      : update('correctIndexes', [index])
                  }
                  aria-label={`Option ${index + 1} is correct`}
                  className="accent-primary size-3.5"
                />
                <Input
                  value={option.text}
                  onChange={(event) => updateOption(index, event.target.value)}
                  placeholder={`Option ${index + 1}`}
                  aria-label={`Option ${index + 1}`}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(index)}
                  disabled={form.options.length <= MIN_QUESTION_OPTIONS}
                  aria-label={`Remove option ${index + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
            disabled={form.options.length >= MAX_QUESTION_OPTIONS}
          >
            <Plus />
            Add option
          </Button>
        </fieldset>
      )}

      <details className="border-border/70 rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-[12.5px] font-medium">
          <ImageIcon className="mr-1.5 inline size-3.5" />
          Image or code shown with the question
          {form.imageUrl || form.codeSnippet ? (
            <span className="text-muted-foreground font-normal"> · attached</span>
          ) : null}
        </summary>

        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="imageUrl">Image URL (optional)</Label>
            <Input
              id="imageUrl"
              value={form.imageUrl}
              onChange={(event) => update('imageUrl', event.target.value)}
              placeholder="https://example.com/diagram.png"
              inputMode="url"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="codeSnippet">Code (optional)</Label>
            <textarea
              id="codeSnippet"
              value={form.codeSnippet}
              onChange={(event) => update('codeSnippet', event.target.value)}
              rows={4}
              spellCheck={false}
              placeholder={'const total = [1, 2, 3].reduce((a, b) => a + b, 0);'}
              className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 font-mono text-[12px] focus-visible:ring-[3px] focus-visible:outline-none"
            />
          </div>
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="questionDifficulty">Difficulty</Label>
          <Select
            id="questionDifficulty"
            value={form.difficulty}
            onChange={(event) =>
              update('difficulty', event.target.value as FormState['difficulty'])
            }
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="explanation">Explanation (optional)</Label>
          <textarea
            id="explanation"
            value={form.explanation}
            onChange={(event) => update('explanation', event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Shown with the answer review after the attempt."
            className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-[13px] focus-visible:ring-[3px] focus-visible:outline-none"
          />
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

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending} className={cn(pending && 'opacity-90')}>
          {pending ? <Loader2 className="animate-spin" /> : <CircleCheck />}
          {editing ? 'Save question' : 'Add question'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
